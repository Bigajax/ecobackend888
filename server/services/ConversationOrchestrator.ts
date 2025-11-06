// server/services/ConversationOrchestrator.ts
import {
  now,
  mapRoleForOpenAI,
  type GetEcoParams,
  type GetEcoResult,
  type ChatMessage,
} from "../utils";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { claudeChatCompletion } from "../core/ClaudeAdapter";
import { defaultGreetingPipeline } from "./conversation/greeting";
import { runFastLaneLLM } from "./conversation/fastLane";
import { buildFullPrompt, selectBanditArms } from "./conversation/promptPlan";
import { defaultResponseFinalizer } from "./conversation/responseFinalizer";
import { firstName } from "./conversation/helpers";
import { computeEcoDecision, MEMORY_THRESHOLD } from "./conversation/ecoDecisionHub";
import type { EcoDecisionResult } from "./conversation/ecoDecisionHub";
import { handlePreLLMShortcuts } from "./conversation/preLLMPipeline";
import { prepareConversationContext } from "./conversation/contextPreparation";
import type {
  EcoStreamHandler,
  EcoStreamingResult,
  EcoLatencyMarks,
  EcoStreamEvent,
} from "./conversation/types";
import { log, isDebug } from "./promptContext/logger";
import { trackRetrieveMode } from "../analytics/events/mixpanelEvents";
import { sha1Hash } from "./conversation/interactionAnalytics";
import {
  createHttpError,
  extractErrorDetail,
  isHttpError,
  resolveErrorStatus,
} from "../utils/http";
import type { ActivationTracer } from "../core/activationTracer";
import { randomUUID } from "node:crypto";

import { persistAnalyticsSafe } from "./analytics/analyticsOrchestrator";
import { inferRetrieveMode, decideRoute, shouldUseFastLane, type RetrieveDecision } from "./decision/pathSelector";
import { computeCalHints, injectCalHints } from "./decision/calPlanner";
import { finalizePreLLM, runStreamingPath } from "./orchestration/streamingPath";
import { runFullPath } from "./orchestration/fullPath";

// Reexport para compatibilidade
export { getEcoResponse as getEcoResponseOtimizado };
export type { EcoStreamEvent, EcoStreamHandler, EcoStreamingResult, EcoLatencyMarks };

function validateEnvironment(needsSupabase: boolean) {
  const missingEnvs: string[] = [];
  if (!process.env.OPENROUTER_API_KEY) {
    missingEnvs.push("OPENROUTER_API_KEY");
  }
  if (needsSupabase) {
    if (!process.env.SUPABASE_URL) missingEnvs.push("SUPABASE_URL");
    if (!process.env.SUPABASE_ANON_KEY) missingEnvs.push("SUPABASE_ANON_KEY");
  }

  if (missingEnvs.length) {
    log.error("[getEcoResponse] missing_env", { missing: missingEnvs });
    throw createHttpError(500, "CONFIG_ERROR", undefined, { missing: missingEnvs });
  }
}

function logSelectorPipeline(decision: EcoDecisionResult, contextSource?: string | null) {
  const debug = (decision as any)?.debug ?? {};
  const stages = debug.selectorStages ?? {};

  const gates = stages.gates ?? null;
  let gateSignals: string[] = [];
  if (gates) {
    gateSignals = Array.isArray((gates as any).signals)
      ? ((gates as any).signals as string[])
      : Object.entries(decision.signals ?? {})
          .filter(([, value]) => Boolean(value))
          .map(([key]) => key);
    log.info({
      selector_stage: "gates",
      raw_count: Array.isArray(gates.raw) ? gates.raw.length : null,
      allowed_count: Array.isArray(gates.allowed) ? gates.allowed.length : null,
      priorizado_count: Array.isArray(gates.priorizado) ? gates.priorizado.length : null,
      nivel: decision.openness,
      intensidade: decision.intensity,
      signals: gateSignals,
      active_biases: Array.isArray((gates as any).active_biases)
        ? (gates as any).active_biases
        : [],
      decayed_active_biases: Array.isArray((gates as any).decayed_active_biases)
        ? (gates as any).decayed_active_biases
        : [],
    });
  }

  const familyDecisions: any[] = Array.isArray(stages.family?.decisions)
    ? stages.family.decisions
    : [];
  const familySignals = Array.isArray((stages.family as any)?.signals)
    ? ((stages.family as any).signals as string[])
    : gateSignals;
  for (const entry of familyDecisions) {
    const eligibleArms = Array.isArray(entry.eligibleArms)
      ? entry.eligibleArms.map((arm: any) => ({
          id: arm.id,
          gate_passed: arm.gatePassed,
          tokens_avg: arm.tokensAvg,
        }))
      : [];
    log.info({
      selector_stage: "family_group",
      family: entry.familyId ?? null,
      eligible_arms: eligibleArms,
      signals: familySignals,
      cold_start: entry.coldStartApplied ?? null,
    });

    const statsSource = Array.isArray(entry.eligibleArms)
      ? entry.eligibleArms.find((arm: any) => arm.id === (entry.tsPick ?? entry.chosen ?? null))
      : null;

    log.info({
      selector_stage: "ts_pick",
      family: entry.familyId ?? null,
      ts_pick: entry.tsPick ?? null,
      chosen: entry.chosen ?? null,
      chosen_by: entry.chosenBy ?? null,
      alpha: statsSource?.alpha ?? null,
      beta: statsSource?.beta ?? null,
      reward_key: entry.rewardKey ?? null,
      tokens_planned: entry.tokensPlanned ?? null,
      cold_start: entry.coldStartApplied ?? null,
    });
  }

  const knapsack = debug.knapsack ?? null;
  if (knapsack) {
    const cap = Number.isFinite(knapsack.budget) ? Number(knapsack.budget) : null;
    const aux = Number.isFinite(knapsack.tokensAditivos)
      ? Number(knapsack.tokensAditivos)
      : null;
    log.info({
      selector_stage: "knapsack",
      aux_tokens_planned: aux,
      cap,
      within_cap: cap != null && aux != null ? aux <= cap : null,
      adopted: Array.isArray(knapsack.adotados) ? knapsack.adotados : [],
    });
  }

  const stitch = stages.stitch ?? null;
  if (stitch) {
    const finals = Array.isArray(stitch.final)
      ? stitch.final
      : Array.isArray(debug.selectedModules)
      ? debug.selectedModules
      : [];
    log.info({
      selector_stage: "stitch",
      final_modules: finals,
    });
  }

  if (contextSource) {
    log.info({
      selector_stage: "rpc",
      context_source: contextSource,
    });
  }
}

async function runPreLLMPipeline({
  thread,
  ultimaMsg,
  userId,
  userName,
  supabase,
  hasAssistantBefore,
  lastMessageId,
  sessionMeta,
  streamHandler,
  clientHour,
  isGuest,
  guestId,
  activationTracer,
}: {
  thread: ChatMessage[];
  ultimaMsg: string;
  userId: string;
  userName?: string | null;
  supabase: ReturnType<typeof supabaseWithBearer> | null;
  hasAssistantBefore: boolean;
  lastMessageId?: string | null;
  sessionMeta?: any;
  streamHandler: EcoStreamHandler | null;
  clientHour?: number;
  isGuest: boolean;
  guestId: string | null;
  activationTracer?: ActivationTracer;
}): Promise<GetEcoResult | EcoStreamingResult | null> {
  const preLLM = await handlePreLLMShortcuts(
    {
      thread,
      ultimaMsg,
      userId,
      userName,
      supabase,
      hasAssistantBefore,
      lastMessageId: lastMessageId ?? undefined,
      sessionMeta,
      streamHandler,
      clientHour: clientHour ?? undefined,
      isGuest,
      guestId: guestId ?? undefined,
    },
    {
      greetingPipeline: defaultGreetingPipeline,
      responseFinalizer: defaultResponseFinalizer,
      now,
    }
  );

  if (!preLLM) {
    return null;
  }

  const ecoDecision = computeEcoDecision(ultimaMsg);
  const retrieveForAnalytics = inferRetrieveMode({ ultimaMsg, hints: null, ecoDecision });
  const tracer = activationTracer || undefined;
  const analyticsContext = {
    retrieveMode: retrieveForAnalytics.mode,
    activationTracer: tracer,
    userId: !isGuest ? userId : null,
  };

  // --- STREAMING SHIM PARA SAUDAÇÃO/ATALHOS ---
  // Se o preLLM retornou um resultado final (não-streaming) e temos streamHandler,
  // emita 1 chunk + done para evitar "Nenhum chunk emitido" na primeira mensagem.
  if (preLLM.kind === "final") {
    const result = preLLM.result as GetEcoResult;

    if (streamHandler) {
      const text = (result as any)?.raw ?? (result as any)?.text ?? "";
      const finishReason = (result as any)?.meta?.finishReason ?? "greeting";

      // prompt_ready
      await streamHandler.onEvent({ type: "control", name: "prompt_ready", timings: {} });
      // único chunk
      if (text && text.length) {
        await streamHandler.onEvent({
          type: "chunk",
          delta: text,
          index: 0,
          content: text,
        });
      }
      // done
      await streamHandler.onEvent({
        type: "control",
        name: "done",
        meta: { finishReason },
      });

      await persistAnalyticsSafe({ ...analyticsContext, result });

      const timings: EcoLatencyMarks = {};
      const streamingResult: EcoStreamingResult = {
        raw: text,
        modelo: (result as any)?.modelo ?? "prellm_greeting",
        usage: (result as any)?.usage,
        finalize: async () => result,
        timings,
      };
      return streamingResult;
    }

    await persistAnalyticsSafe({ ...analyticsContext, result: preLLM.result });
    return preLLM.result;
  }

  const finalize = finalizePreLLM(preLLM.result.finalize, analyticsContext);
  return { ...preLLM.result, finalize };
}

function applyMemoryDecision({
  ecoDecision,
  isGuest,
  activationTracer,
}: {
  ecoDecision: EcoDecisionResult;
  isGuest: boolean;
  activationTracer?: ActivationTracer;
}) {
  const crossedThreshold = ecoDecision.intensity >= MEMORY_THRESHOLD;
  ecoDecision.saveMemory = ecoDecision.saveMemory && !isGuest;
  ecoDecision.hasTechBlock = ecoDecision.saveMemory;
  activationTracer?.setMemoryDecision(
    ecoDecision.saveMemory,
    ecoDecision.intensity,
    crossedThreshold
      ? `intensity>=${MEMORY_THRESHOLD} (${ecoDecision.intensity.toFixed(1)})`
      : `intensity<${MEMORY_THRESHOLD} (${ecoDecision.intensity.toFixed(1)})`
  );
}

function emitRetrieveModeTelemetry({
  retrieveDecision,
  sessionMeta,
  isGuest,
  guestId,
  userId,
}: {
  retrieveDecision: RetrieveDecision;
  sessionMeta?: any;
  isGuest: boolean;
  guestId: string | null;
  userId: string;
}) {
  const retrieveDistinctId = sessionMeta?.distinctId ?? (isGuest ? guestId ?? undefined : userId);
  try {
    trackRetrieveMode({
      distinctId: retrieveDistinctId ?? undefined,
      userId: !isGuest ? userId : undefined,
      mode: retrieveDecision.mode,
      reason: retrieveDecision.reason,
      word_count: retrieveDecision.wordCount,
      char_length: retrieveDecision.charLength,
    });
  } catch (error) {
    if (isDebug()) {
      const message = error instanceof Error ? error.message : String(error);
      log.debug("[RetrieveMode] track_failed", { message });
    }
  }
}

async function buildPromptContext({
  timings,
  routeDecision,
  thread,
  ultimaMsg,
  systemPromptDeps,
  calHints,
  retrieveDecision,
  authUid,
}: {
  timings: EcoLatencyMarks;
  routeDecision: ReturnType<typeof decideRoute>;
  thread: ChatMessage[];
  ultimaMsg: string;
  systemPromptDeps: {
    supabase: ReturnType<typeof supabaseWithBearer> | null;
    promptOverride?: string;
    metaFromBuilder?: any;
    mems: GetEcoParams["mems"];
    userName?: string | null;
    forcarMetodoViva: boolean;
    blocoTecnicoForcado: string | null;
    ecoDecision: EcoDecisionResult;
    userId: string;
    isGuest: boolean;
    guestId: string | null;
    activationTracer?: ActivationTracer;
  };
  calHints: ReturnType<typeof computeCalHints>["calHints"];
  retrieveDecision: RetrieveDecision;
  authUid: string | null;
}) {
  timings.contextBuildStart = now();
  log.info("// LATENCY: context_build_start", { at: timings.contextBuildStart });

  const { systemPrompt, context } = await prepareConversationContext({
    userId: systemPromptDeps.isGuest ? undefined : systemPromptDeps.userId,
    ultimaMsg,
    supabase: systemPromptDeps.supabase,
    promptOverride: systemPromptDeps.promptOverride,
    metaFromBuilder: systemPromptDeps.metaFromBuilder,
    mems: systemPromptDeps.mems ?? [],
    userName: systemPromptDeps.userName,
    forcarMetodoViva: systemPromptDeps.forcarMetodoViva,
    blocoTecnicoForcado: systemPromptDeps.blocoTecnicoForcado,
    decision: systemPromptDeps.ecoDecision,
    onDerivadosError: (error) => {
      if (isDebug()) {
        const message = error instanceof Error ? error.message : String(error);
        log.debug("[Orchestrator] derivados fetch falhou", { message });
      }
    },
    cacheUserId: systemPromptDeps.userId,
    isGuest: systemPromptDeps.isGuest,
    guestId: systemPromptDeps.guestId ?? undefined,
    activationTracer: systemPromptDeps.activationTracer || undefined,
    retrieveMode: retrieveDecision.mode,
    authUid,
  });

  logSelectorPipeline(systemPromptDeps.ecoDecision, context?.sources?.mems ?? null);

  const memsSemelhantes = context?.memsSemelhantes ?? [];
  const { prompt: basePromptMessages, maxTokens } = buildFullPrompt({
    decision: routeDecision,
    ultimaMsg,
    systemPrompt,
    messages: thread,
  });

  const basePromptHash = sha1Hash(systemPrompt);
  const { prompt, injected } = injectCalHints({ prompt: basePromptMessages, calHints });
  if (!injected && process.env.ECO_DEBUG === "1" && calHints) {
    log.debug?.(
      `[CAL] key=${calHints.key} score=${calHints.score.toFixed(2)} flags=[${calHints.flags.join(",")}] skipped`
    );
  }

  timings.contextBuildEnd = now();
  log.info("// LATENCY: context_build_end", {
    at: timings.contextBuildEnd,
    durationMs:
      timings.contextBuildStart && timings.contextBuildEnd
        ? timings.contextBuildEnd - timings.contextBuildStart
        : undefined,
  });

  return { prompt, maxTokens, basePromptHash, context, memsSemelhantes, systemPrompt };
}

async function maybeRunFastLane({
  routeDecision,
  streamHandler,
  thread,
  userName,
  ultimaMsg,
  userId,
  supabase,
  lastMessageId,
  sessionMeta,
  isGuest,
  guestId,
  ecoDecision,
  activationTracer,
  retrieveDecision,
  interactionId,
}: {
  routeDecision: ReturnType<typeof decideRoute>;
  streamHandler: EcoStreamHandler | null;
  thread: ChatMessage[];
  userName?: string | null;
  ultimaMsg: string;
  userId: string;
  supabase: ReturnType<typeof supabaseWithBearer> | null;
  lastMessageId?: string | null;
  sessionMeta?: any;
  isGuest: boolean;
  guestId: string | null;
  ecoDecision: EcoDecisionResult;
  activationTracer?: ActivationTracer;
  retrieveDecision: RetrieveDecision;
  interactionId?: string | null;
}): Promise<GetEcoResult | null> {
  if (!shouldUseFastLane({ routeDecision, streamHandler })) {
    return null;
  }

  const inicioFast = now();
  const fast = await runFastLaneLLM({
    messages: thread,
    userName: userName ?? undefined,
    ultimaMsg,
    hasAssistantBefore: routeDecision.hasAssistantBefore,
    userId,
    supabase,
    lastMessageId: lastMessageId ?? undefined,
    startedAt: inicioFast,
    deps: {
      claudeClient: claudeChatCompletion,
      responseFinalizer: defaultResponseFinalizer,
      firstName,
    },
    sessionMeta,
    isGuest,
    guestId: guestId ?? undefined,
    ecoDecision,
    interactionId,
  });

  await persistAnalyticsSafe({
    result: fast.response,
    retrieveMode: retrieveDecision.mode,
    activationTracer: activationTracer || undefined,
    userId: !isGuest ? userId : null,
  });

  return fast.response;
}

export async function getEcoResponse(
  params: GetEcoParams & { promptOverride?: string; metaFromBuilder?: any; abortSignal?: AbortSignal }
): Promise<GetEcoResult>;
export async function getEcoResponse(
  params: GetEcoParams & {
    promptOverride?: string;
    metaFromBuilder?: any;
    stream: EcoStreamHandler;
    abortSignal?: AbortSignal;
  }
): Promise<EcoStreamingResult>;
export async function getEcoResponse({
  messages,
  userId,
  authUid = null,
  userName,
  accessToken,
  mems = [],
  forcarMetodoViva = false,
  blocoTecnicoForcado = null,
  clientHour,
  promptOverride,
  metaFromBuilder,
  sessionMeta,
  stream,
  interactionId,
  activationTracer,
  isGuest = false,
  guestId = null,
  abortSignal,
}: GetEcoParams & {
  promptOverride?: string;
  metaFromBuilder?: any;
  stream?: EcoStreamHandler;
  abortSignal?: AbortSignal;
}): Promise<GetEcoResult | EcoStreamingResult> {
  const normalizedClientHour = clientHour ?? undefined;
  const normalizedActivationTracer = activationTracer || undefined;
  const needsSupabase = !isGuest && !!accessToken;
  validateEnvironment(needsSupabase);

  if (!Array.isArray(messages) || messages.length === 0) {
    throw createHttpError(400, "BAD_REQUEST", 'Parâmetro "messages" vazio ou inválido.');
  }

  try {
    const thread: ChatMessage[] = messages;
    const lastMessage = thread.at(-1);
    const lastMessageId = lastMessage?.id;
    const ultimaMsg = lastMessage?.content ?? "";

    const streamHandler = stream ?? null;
    const timings: EcoLatencyMarks = {};
    let ecoDecision: EcoDecisionResult;
    let retrieveDecision: RetrieveDecision;

    if (abortSignal?.aborted) {
      const reason = abortSignal.reason ?? new Error("aborted");
      throw reason instanceof Error ? reason : new Error(String(reason));
    }

    const supabase = !isGuest && accessToken ? supabaseWithBearer(accessToken) : null;
    const hasAssistantBeforeInThread = thread
      .slice(0, -1)
      .some((msg) => mapRoleForOpenAI(msg.role) === "assistant");

    const preLLMResult = await runPreLLMPipeline({
      thread,
      ultimaMsg,
      userId,
      userName,
      supabase,
      hasAssistantBefore: hasAssistantBeforeInThread,
      lastMessageId,
      sessionMeta,
      streamHandler,
      clientHour: normalizedClientHour,
      isGuest,
      guestId,
      activationTracer: normalizedActivationTracer,
    });

    if (preLLMResult) {
      return preLLMResult;
    }

    ecoDecision = computeEcoDecision(ultimaMsg);
    applyMemoryDecision({ ecoDecision, isGuest, activationTracer: normalizedActivationTracer });

    const routeDecision = decideRoute({
      messages: thread,
      ultimaMsg,
      forcarMetodoViva,
      promptOverride,
      decision: ecoDecision,
    });

    if (isDebug()) {
      log.debug("[Orchestrator] flags", {
        promptOverrideLen: (promptOverride || "").trim().length,
        low: routeDecision.lowComplexity,
        vivaAtivo: routeDecision.vivaAtivo,
        nivelRoteador: routeDecision.nivelRoteador,
        ultimaLen: (ultimaMsg || "").length,
        mode: routeDecision.mode,
      });
    }

    retrieveDecision = inferRetrieveMode({ ultimaMsg, hints: null, ecoDecision });

    const fastLaneResult = await maybeRunFastLane({
      routeDecision,
      streamHandler,
      thread,
      userName,
      ultimaMsg,
      userId,
      supabase,
      lastMessageId,
      sessionMeta,
      isGuest,
      guestId,
      ecoDecision,
      activationTracer: normalizedActivationTracer,
      retrieveDecision,
      interactionId,
    });
    if (fastLaneResult) {
      return fastLaneResult;
    }

    const calMode = (process.env.ECO_CAL_MODE ?? "on").toLowerCase();
    let calHints: ReturnType<typeof computeCalHints>["calHints"] = null;
    if (calMode !== "off") {
      const { calHints: computedHints } = computeCalHints({ thread, ultimaMsg });
      calHints = computedHints;
    }

    retrieveDecision = inferRetrieveMode({ ultimaMsg, hints: calHints ?? undefined, ecoDecision });

    emitRetrieveModeTelemetry({ retrieveDecision, sessionMeta, isGuest, guestId, userId });

    const banditDistinctId = sessionMeta?.distinctId ?? (isGuest ? guestId ?? undefined : userId);
    selectBanditArms({
      decision: ecoDecision,
      distinctId: banditDistinctId ?? undefined,
      userId: !isGuest ? userId : undefined,
    });

    const { prompt, maxTokens, basePromptHash, context, memsSemelhantes, systemPrompt } = await buildPromptContext({
      timings,
      routeDecision,
      thread,
      ultimaMsg,
      systemPromptDeps: {
        supabase,
        promptOverride,
        metaFromBuilder,
        mems,
        userName,
        forcarMetodoViva,
        blocoTecnicoForcado,
        ecoDecision,
        userId,
        isGuest,
        guestId,
        activationTracer: normalizedActivationTracer,
      },
      calHints,
      retrieveDecision,
      authUid,
    });

    const principalModel = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-sonnet-4.5-20250929";
    normalizedActivationTracer?.setModel?.(principalModel);

    if (streamHandler) {
      return runStreamingPath({
        llmParams: {
          prompt,
          maxTokens,
          principalModel,
          decision: routeDecision,
          ultimaMsg,
          userName,
          ecoDecision,
          userId,
          supabase,
          lastMessageId: lastMessageId ?? undefined,
          sessionMeta,
          streamHandler,
          timings,
          isGuest,
          guestId: guestId ?? undefined,
          thread,
          calHints: calHints ?? undefined,
          memsSemelhantes,
          contextFlags: context.flags,
          contextMeta: context.meta,
          continuity: context.continuity,
          basePrompt: systemPrompt,
          basePromptHash,
          abortSignal,
          interactionId: interactionId ?? undefined,
        },
        analytics: {
          retrieveMode: retrieveDecision.mode,
          activationTracer: normalizedActivationTracer,
          userId: !isGuest ? userId : null,
        },
      });
    }

    return runFullPath({
      llmParams: {
        prompt,
        maxTokens,
        principalModel,
        ultimaMsg,
        basePrompt: systemPrompt,
        basePromptHash,
        userName,
        decision: routeDecision,
        ecoDecision,
        userId,
        supabase,
        lastMessageId: lastMessageId ?? undefined,
        sessionMeta,
        timings,
        thread,
        isGuest,
        guestId: guestId ?? undefined,
        calHints: calHints ?? undefined,
        memsSemelhantes,
        contextFlags: context.flags,
        contextMeta: context.meta,
        continuity: context.continuity,
        interactionId: interactionId ?? undefined,
      },
      analytics: {
        retrieveMode: retrieveDecision.mode,
        activationTracer: normalizedActivationTracer,
        userId: !isGuest ? userId : null,
      },
    });
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }

    const status = resolveErrorStatus(error);
    if (status && (status >= 500 || status === 401 || status === 403 || status === 429)) {
      const detail = extractErrorDetail(error);
      log.warn("[getEcoResponse] upstream_error", {
        provider: "openrouter",
        status,
        detail_excerpt: detail ?? null,
      });
      const extra: Record<string, unknown> = { status };
      if (detail) {
        extra.detail_excerpt = detail;
      }
      throw createHttpError(502, "UPSTREAM_ERROR", undefined, extra);
    }

    const traceId = randomUUID();
    log.error("[getEcoResponse] unexpected", {
      trace_id: traceId,
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
    });
    throw createHttpError(500, "INTERNAL_ERROR", undefined, { trace_id: traceId });
  }
}
