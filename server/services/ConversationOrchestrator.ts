// server/services/ConversationOrchestrator.ts
import { now, mapRoleForOpenAI, type GetEcoParams, type GetEcoResult, type ChatMessage } from "../utils";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { claudeChatCompletion } from "../core/ClaudeAdapter";
import { planHints } from "../core/ResponsePlanner";
import { materializeHints } from "../core/ResponseGenerator";
import { log, isDebug } from "./promptContext/logger";
import { trackRetrieveMode } from "../analytics/events/mixpanelEvents";

import { defaultGreetingPipeline } from "./conversation/greeting";
import { defaultConversationRouter } from "./conversation/router";
import { runFastLaneLLM } from "./conversation/fastLane";
import { buildFullPrompt } from "./conversation/promptPlan";
import { defaultResponseFinalizer } from "./conversation/responseFinalizer";
import { firstName } from "./conversation/helpers";
import { computeEcoDecision, MEMORY_THRESHOLD } from "./conversation/ecoDecisionHub";
import type { EcoDecisionResult } from "./conversation/ecoDecisionHub";

import { handlePreLLMShortcuts } from "./conversation/preLLMPipeline";
import { prepareConversationContext } from "./conversation/contextPreparation";
import { executeStreamingLLM } from "./conversation/streamingOrchestrator";
import { executeFullLLM } from "./conversation/fullOrchestrator";
import type { EcoHints } from "../utils/types";
import type { RetrieveMode } from "./supabase/memoriaRepository";

import type {
  EcoStreamHandler,
  EcoStreamingResult,
  EcoLatencyMarks,
  EcoStreamEvent,
} from "./conversation/types";
import { randomUUID } from "node:crypto";
import { createHttpError, extractErrorDetail, isHttpError, resolveErrorStatus } from "../utils/http";

// Reexport para compatibilidade
export { getEcoResponse as getEcoResponseOtimizado };
export type { EcoStreamEvent, EcoStreamHandler, EcoStreamingResult, EcoLatencyMarks };

function inferRetrieveMode({
  ultimaMsg,
  hints,
  ecoDecision,
}: {
  ultimaMsg: string;
  hints?: EcoHints | null;
  ecoDecision: EcoDecisionResult;
}): { mode: RetrieveMode; reason: string; wordCount: number; charLength: number } {
  const text = (ultimaMsg ?? "").trim();
  const charLength = text.length;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const paragraphCount = text
    ? text
        .split(/\n{2,}/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0).length
    : 0;

  const hasDeepFlag = Array.isArray(hints?.flags)
    ? hints!.flags!.some((flag) => /journal|reflex|longform|profundo/i.test(flag))
    : false;

  if (hasDeepFlag) {
    return { mode: "DEEP", reason: "hint_flag", wordCount, charLength };
  }

  if (wordCount >= 150 || charLength >= 700) {
    return { mode: "DEEP", reason: "long_text", wordCount, charLength };
  }

  if (paragraphCount >= 3 && wordCount >= 80) {
    return { mode: "DEEP", reason: "multi_paragraph", wordCount, charLength };
  }

  if (ecoDecision.intensity >= 7 && ecoDecision.openness >= 2 && wordCount >= 60) {
    return { mode: "DEEP", reason: "high_intensity", wordCount, charLength };
  }

  if (wordCount >= 100) {
    return { mode: "DEEP", reason: "long_words", wordCount, charLength };
  }

  if (wordCount <= 40 && charLength <= 260) {
    return { mode: "FAST", reason: "short_text", wordCount, charLength };
  }

  return { mode: "FAST", reason: "default", wordCount, charLength };
}

export async function getEcoResponse(
  params: GetEcoParams & { promptOverride?: string; metaFromBuilder?: any }
): Promise<GetEcoResult>;
export async function getEcoResponse(
  params: GetEcoParams & {
    promptOverride?: string;
    metaFromBuilder?: any;
    stream: EcoStreamHandler;
  }
): Promise<EcoStreamingResult>;

/**
 * Orquestrador principal da Eco (modo full e streaming).
 * - Se `stream` vier, usa pipeline de streaming e emite eventos.
 * - Se não vier, retorna resposta completa (full).
 */
export async function getEcoResponse({
  messages,
  userId,
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
  activationTracer,
  isGuest = false,
  guestId = null,
}: GetEcoParams & {
  promptOverride?: string;
  metaFromBuilder?: any;
  stream?: EcoStreamHandler;
}): Promise<GetEcoResult | EcoStreamingResult> {
  const needsSupabase = !isGuest && !!accessToken;
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

  if (!Array.isArray(messages) || messages.length === 0) {
    throw createHttpError(400, "BAD_REQUEST", 'Parâmetro \"messages\" vazio ou inválido.');
  }

  try {
    const thread: ChatMessage[] = messages;
    const lastMessage = thread.at(-1);
    const lastMessageId = lastMessage?.id;
    const ultimaMsg = lastMessage?.content ?? "";

    const streamHandler = stream ?? null;
    const timings: EcoLatencyMarks = {};

    // Supabase somente quando NÃO for guest e houver token
    const supabase = !isGuest && accessToken ? supabaseWithBearer(accessToken) : null;

    const hasAssistantBeforeInThread = thread
      .slice(0, -1)
      .some((msg) => mapRoleForOpenAI(msg.role) === "assistant");

    // Pré-atalhos (saudações, respostas curtas, etc.)
    const preLLM = await handlePreLLMShortcuts(
      {
        thread,
        ultimaMsg,
        userId,
        userName,
        supabase,
        hasAssistantBefore: hasAssistantBeforeInThread,
        lastMessageId: lastMessageId ?? undefined,
        sessionMeta,
        streamHandler, // já passamos, mas garantimos emissão abaixo
        clientHour,
        isGuest,
        guestId: guestId ?? undefined,
      },
      {
        greetingPipeline: defaultGreetingPipeline,
        responseFinalizer: defaultResponseFinalizer,
        now,
      }
    );

    if (preLLM) {
      return preLLM.result;
    }

    // Decisão sobre memória e modo de conversa
    const ecoDecision = computeEcoDecision(ultimaMsg);
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

    const routeDecision = defaultConversationRouter.decide({
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

    // Fast lane (somente quando não for streaming)
    if (routeDecision.mode === "fast" && !streamHandler) {
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
      });

      return fast.response;
    }

    const calMode = (process.env.ECO_CAL_MODE ?? "on").toLowerCase();
    let plannedHints: ReturnType<typeof planHints> | null = null;
    let calHints: EcoHints | null = null;

    if (calMode !== "off") {
      const recentUserInputs = thread
        .slice(0, -1)
        .filter((msg) => mapRoleForOpenAI(msg.role) === "user")
        .slice(-3)
        .map((msg) => msg.content ?? "");

      let lastHintKey: string | null = null;
      for (let i = thread.length - 1; i >= 0; i -= 1) {
        const candidate = thread[i];
        if (!candidate || typeof candidate.content !== "string") continue;
        if (!candidate.content.includes("ECO_HINTS")) continue;
        const match = candidate.content.match(/ECO_HINTS\(JSON\):\s*(\{.+?\})\s*\|/);
        if (!match) continue;
        try {
          const parsed = JSON.parse(match[1]!);
          if (parsed && typeof parsed.key === "string") {
            lastHintKey = parsed.key;
            break;
          }
        } catch {
          // ignora parsing falho
        }
      }

      plannedHints = planHints(ultimaMsg, {
        recentUserInputs,
        lastHintKey,
      });
      calHints = materializeHints(plannedHints, ultimaMsg);
    }

    const retrieveDecision = inferRetrieveMode({
      ultimaMsg,
      hints: calHints ?? undefined,
      ecoDecision,
    });

    const retrieveDistinctId =
      sessionMeta?.distinctId ?? (isGuest ? guestId ?? undefined : userId);
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

    // Montagem de contexto (prompts, memórias, etc.)
    timings.contextBuildStart = now();
    log.info("// LATENCY: context_build_start", { at: timings.contextBuildStart });

    const { systemPrompt, context } = await prepareConversationContext({
      userId: isGuest ? undefined : userId,
      ultimaMsg,
      supabase,
      promptOverride,
      metaFromBuilder,
      mems,
      userName,
      forcarMetodoViva,
      blocoTecnicoForcado,
      decision: ecoDecision,
      onDerivadosError: (error) => {
        if (isDebug()) {
          const message = error instanceof Error ? error.message : String(error);
          log.debug("[Orchestrator] derivados fetch falhou", { message });
        }
      },
      cacheUserId: userId,
      isGuest,
      activationTracer,
      retrieveMode: retrieveDecision.mode,
    });

    const memsSemelhantes = Array.isArray(context?.memsSemelhantes)
      ? context.memsSemelhantes
      : [];

    const { prompt, maxTokens } = buildFullPrompt({
      decision: routeDecision,
      ultimaMsg,
      systemPrompt,
      messages: thread,
    });

    if (calHints && calHints.score >= 0.6) {
      const hintPayload = `ECO_HINTS(JSON): ${JSON.stringify(calHints)} | Use como orientação. Não repita literalmente. Preserve continuidade.`;
      prompt.unshift({
        role: "system",
        name: "eco_hints",
        content: hintPayload,
      });
      if (process.env.ECO_DEBUG === "1") {
        log.debug?.(
          `[CAL] key=${calHints.key} score=${calHints.score.toFixed(2)} flags=[${calHints.flags.join(",")}] injected`
        );
      }
    }

    timings.contextBuildEnd = now();
    log.info("// LATENCY: context_build_end", {
      at: timings.contextBuildEnd,
      durationMs:
        timings.contextBuildStart && timings.contextBuildEnd
          ? timings.contextBuildEnd - timings.contextBuildStart
          : undefined,
    });

    const principalModel = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-3-5-sonnet";
    activationTracer?.setModel?.(principalModel);

    // STREAMING
    if (streamHandler) {
      return executeStreamingLLM({
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
      });
    }

    // Execução completa (sem stream)
    const resultado = await executeFullLLM({
      prompt,
      maxTokens,
      principalModel,
      ultimaMsg,
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
    });

    return resultado;
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
