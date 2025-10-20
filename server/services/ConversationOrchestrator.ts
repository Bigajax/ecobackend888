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
import { buildFullPrompt, selectBanditArms } from "./conversation/promptPlan";
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
import supabaseAdmin, { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import type { ActivationTracer } from "../core/activationTracer";
import { sha1Hash } from "./conversation/interactionAnalytics";

import type {
  EcoStreamHandler,
  EcoStreamingResult,
  EcoLatencyMarks,
  EcoStreamEvent,
} from "./conversation/types";
import { randomUUID } from "node:crypto";
import { createHttpError, extractErrorDetail, isHttpError, resolveErrorStatus } from "../utils/http";
import type { RuntimeMetrics } from "../types/telemetry";

// Reexport para compatibilidade
export { getEcoResponse as getEcoResponseOtimizado };
export type { EcoStreamEvent, EcoStreamHandler, EcoStreamingResult, EcoLatencyMarks };

type ResponseBanditReward = {
  interaction_id: string | null;
  family: string;
  arm_id: string;
  chosen_by: "ts" | "baseline" | "shadow";
  reward_key: string | null;
  reward: number | null;
  reward_reason: string | null;
  tokens: number | null;
  tokens_cap: number | null;
  tokens_planned: number | null;
  ttfb_ms: number | null;
  ttlc_ms: number | null;
  like: number | null;
  like_source: string | null;
  dislike_reason: string | null;
  emotional_intensity: number | null;
  memory_saved: boolean | null;
  reply_within_10m: boolean | null;
  user_id: string | null;
  guest_id: string | null;
  meta: Record<string, unknown> | null;
};

type ResponseAnalyticsMeta = {
  response_id: string | null;
  q?: number;
  estruturado_ok?: boolean;
  memoria_ok?: boolean;
  bloco_ok?: boolean;
  tokens_total?: number | null;
  tokens_aditivos?: number | null;
  mem_count?: number;
  bandit_rewards?: Array<ResponseBanditReward | null | undefined>;
  module_outcomes?: Array<{ module_id: string; tokens: number; q: number; vpt: number | null }>;
  knapsack?: {
    budget: number | null;
    adotados: string[];
    ganho_estimado: number | null;
    tokens_aditivos: number | null;
  } | null;
  latency?: { ttfb_ms: number | null; ttlc_ms: number | null; tokens_total: number | null };
};

type RetrieveDecision = ReturnType<typeof inferRetrieveMode>;

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

function isValidUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (normalized.length !== value.length) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(normalized);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  const numeric = asNumber(value);
  if (numeric == null) return null;
  return Math.round(numeric);
}

export async function persistAnalyticsRecords({
  result,
  retrieveMode,
  activationTracer,
  userId,
}: {
  result: GetEcoResult;
  retrieveMode: RetrieveMode;
  activationTracer?: ActivationTracer | null;
  userId?: string | null;
}): Promise<void> {
  if (!result) return;

  const meta = (result.meta ??= {});
  const analyticsMeta = (meta.analytics ?? null) as ResponseAnalyticsMeta | null;
  if (!analyticsMeta) return;

  const existingResponseId = analyticsMeta.response_id;
  const responseId = isValidUuid(existingResponseId) ? existingResponseId : randomUUID();
  meta.analytics = { ...analyticsMeta, response_id: responseId };

  try {
    ensureSupabaseConfigured();
  } catch (error) {
    if (process.env.ECO_DEBUG === "1") {
      const message = error instanceof Error ? error.message : String(error);
      log.debug("[analytics]", { tabela: "skipped", response_id: responseId, motivo: message });
    }
    return;
  }

  const analyticsClient = supabaseAdmin.schema("analytics");
  const normalizedUserId = isValidUuid(userId) ? userId : null;

  const runtime: RuntimeMetrics = { latency: { ttfb_ms: null, ttlc_ms: null } };

  const tracerSnapshot = activationTracer?.snapshot?.();
  const tracerLatency = tracerSnapshot?.latency;
  if (
    typeof tracerLatency?.firstTokenMs === "number" &&
    Number.isFinite(tracerLatency.firstTokenMs)
  ) {
    runtime.latency.ttfb_ms = Math.max(0, Math.round(tracerLatency.firstTokenMs));
  }
  if (typeof tracerLatency?.totalMs === "number" && Number.isFinite(tracerLatency.totalMs)) {
    runtime.latency.ttlc_ms = Math.max(0, Math.round(tracerLatency.totalMs));
  }

  const analyticsLatency = analyticsMeta.latency ?? null;
  if (
    runtime.latency.ttfb_ms == null &&
    typeof analyticsLatency?.ttfb_ms === "number" &&
    Number.isFinite(analyticsLatency.ttfb_ms)
  ) {
    runtime.latency.ttfb_ms = Math.max(0, Math.round(analyticsLatency.ttfb_ms));
  }

  if (
    runtime.latency.ttlc_ms == null &&
    typeof analyticsLatency?.ttlc_ms === "number" &&
    Number.isFinite(analyticsLatency.ttlc_ms)
  ) {
    runtime.latency.ttlc_ms = Math.max(0, Math.round(analyticsLatency.ttlc_ms));
  }

  if (runtime.latency.ttlc_ms == null) {
    const timings = (meta.debug_trace as { timings?: EcoLatencyMarks; latencyMs?: number } | undefined)?.timings;
    if (timings?.llmStart != null && timings?.llmEnd != null) {
      const diff = Math.round(timings.llmEnd - timings.llmStart);
      if (Number.isFinite(diff)) {
        runtime.latency.ttlc_ms = Math.max(0, diff);
      }
    }
  }

  if (runtime.latency.ttlc_ms == null) {
    const latencyMs = (meta.debug_trace as { latencyMs?: number } | undefined)?.latencyMs;
    if (typeof latencyMs === "number" && Number.isFinite(latencyMs)) {
      runtime.latency.ttlc_ms = Math.max(0, Math.round(latencyMs));
    }
  }

  const ttfbMs = runtime.latency.ttfb_ms;
  const ttlcMs = runtime.latency.ttlc_ms;

  const tokensTotal = asInteger(analyticsMeta.tokens_total);
  const tokensAditivos = asInteger(analyticsMeta.tokens_aditivos);

  const respostaRow = {
    response_id: responseId,
    user_id: normalizedUserId,
    retrieve_mode: retrieveMode,
    q: typeof analyticsMeta.q === "number" ? analyticsMeta.q : null,
    estruturado_ok:
      typeof analyticsMeta.estruturado_ok === "boolean" ? analyticsMeta.estruturado_ok : null,
    memoria_ok: typeof analyticsMeta.memoria_ok === "boolean" ? analyticsMeta.memoria_ok : null,
    bloco_ok: typeof analyticsMeta.bloco_ok === "boolean" ? analyticsMeta.bloco_ok : null,
    tokens_total: tokensTotal,
    tokens_aditivos: tokensAditivos,
    ttfb_ms: ttfbMs,
    ttlc_ms: ttlcMs,
  };

  const tasks: Array<Promise<void>> = [];

  const insertRows = async (tabela: string, rows: Array<Record<string, unknown>>) => {
    if (!rows.length) return;
    const payload = rows.map((row) => {
      const normalized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key] = value ?? null;
      }
      return normalized;
    });
    try {
      const { error } = await analyticsClient.from(tabela).insert(payload);
      if (error) {
        log.error("[analytics] insert_failed", {
          tabela,
          response_id: responseId,
          payload,
          code: error.code ?? null,
          message: error.message,
        });
        return;
      }
      log.info("[analytics] insert_success", { tabela, response_id: responseId });
    } catch (error) {
      log.error("[analytics] insert_failed", {
        tabela,
        response_id: responseId,
        payload,
        code: error instanceof Error && (error as any).code ? (error as any).code : null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  tasks.push(insertRows("resposta_q", [respostaRow]));

  if (Array.isArray(analyticsMeta.bandit_rewards) && analyticsMeta.bandit_rewards.length > 0) {
    const banditRows = analyticsMeta.bandit_rewards
      .filter((reward): reward is ResponseBanditReward => {
        if (!reward) return false;
        const familyValid = typeof reward.family === "string" && reward.family.length > 0;
        const armValid = typeof reward.arm_id === "string" && reward.arm_id.length > 0;
        const chooserValid =
          reward.chosen_by === "ts" ||
          reward.chosen_by === "baseline" ||
          reward.chosen_by === "shadow";
        return familyValid && armValid && chooserValid;
      })
      .map((reward) => ({
        interaction_id: reward.interaction_id ?? responseId ?? null,
        response_id: responseId,
        pilar: reward.family,
        family: reward.family,
        arm: reward.arm_id,
        arm_id: reward.arm_id,
        recompensa:
          typeof reward.reward === "number" && Number.isFinite(reward.reward)
            ? reward.reward
            : null,
        reward:
          typeof reward.reward === "number" && Number.isFinite(reward.reward)
            ? reward.reward
            : null,
        reward_reason: reward.reward_reason ?? null,
        chosen_by: reward.chosen_by,
        reward_key: reward.reward_key,
        tokens: reward.tokens,
        tokens_cap:
          typeof reward.tokens_cap === "number" && Number.isFinite(reward.tokens_cap)
            ? reward.tokens_cap
            : null,
        tokens_planned: reward.tokens_planned,
        ttfb_ms: reward.ttfb_ms,
        ttlc_ms: reward.ttlc_ms,
        like: reward.like,
        like_source: reward.like_source,
        dislike_reason: reward.dislike_reason,
        emotional_intensity: reward.emotional_intensity,
        memory_saved: reward.memory_saved,
        reply_within_10m: reward.reply_within_10m,
        user_id: reward.user_id,
        guest_id: reward.guest_id,
        meta: reward.meta ?? null,
      }));
    if (banditRows.length) {
      tasks.push(insertRows("bandit_rewards", banditRows));
    }
  }

  if (Array.isArray(analyticsMeta.module_outcomes) && analyticsMeta.module_outcomes.length > 0) {
    const moduleRows = analyticsMeta.module_outcomes
      .filter(
        (entry): entry is { module_id: string; tokens: number; q: number; vpt: number | null } =>
          Boolean(
            entry &&
              typeof entry.module_id === "string" &&
              entry.module_id &&
              typeof entry.tokens === "number" &&
              Number.isFinite(entry.tokens) &&
              entry.tokens > 0 &&
              typeof entry.q === "number" &&
              Number.isFinite(entry.q)
          )
      )
      .map((entry) => ({
        response_id: responseId,
        module_id: entry.module_id,
        tokens: Math.max(0, Math.round(entry.tokens)),
        q: entry.q,
        vpt:
          typeof entry.vpt === "number" && Number.isFinite(entry.vpt)
            ? entry.vpt
            : entry.tokens > 0
            ? entry.q / entry.tokens
            : null,
      }));
    if (moduleRows.length) {
      tasks.push(insertRows("module_outcomes", moduleRows));
    }
  }

  if (analyticsMeta.knapsack) {
    const knapsack = analyticsMeta.knapsack;
    const budget = asInteger(knapsack.budget);
    const ganhoEstimado = asNumber(knapsack.ganho_estimado);
    const tokensKnapsack = asInteger(knapsack.tokens_aditivos ?? analyticsMeta.tokens_aditivos);
    const adotados = Array.isArray(knapsack.adotados)
      ? knapsack.adotados.filter((value) => typeof value === "string")
      : [];
    tasks.push(
      insertRows("knapsack_decision", [
        {
          response_id: responseId,
          budget,
          adotados,
          ganho_estimado: ganhoEstimado,
          tokens_aditivos: tokensKnapsack,
        },
      ])
    );
  }

  const latencyRow = {
    response_id: responseId,
    ttfb_ms: ttfbMs,
    ttlc_ms: ttlcMs,
    tokens_total: tokensTotal,
  };
  if (latencyRow.ttfb_ms != null || latencyRow.ttlc_ms != null || latencyRow.tokens_total != null) {
    tasks.push(insertRows("latency_samples", [latencyRow]));
  }

  await Promise.all(tasks);
}

async function persistAnalyticsSafe(options: {
  result: GetEcoResult;
  retrieveMode: RetrieveMode;
  activationTracer?: ActivationTracer | null;
  userId?: string | null;
}): Promise<void> {
  try {
    await persistAnalyticsRecords(options);
  } catch (error) {
    if (process.env.ECO_DEBUG === "1") {
      const responseId =
        ((options.result?.meta as { analytics?: { response_id?: string | null } } | null)?.analytics?.response_id ??
          null);
      const message = error instanceof Error ? error.message : String(error);
      log.debug("[analytics]", { tabela: "persist_failed", response_id: responseId, motivo: message });
    }
  }
}

function logSelectorPipeline(decision: EcoDecisionResult, contextSource?: string | null) {
  const debug = (decision as any)?.debug ?? {};
  const stages = debug.selectorStages ?? {};

  const gates = stages.gates ?? null;
  if (gates) {
    log.info({
      selector_stage: "gates",
      raw_count: Array.isArray(gates.raw) ? gates.raw.length : null,
      allowed_count: Array.isArray(gates.allowed) ? gates.allowed.length : null,
      priorizado_count: Array.isArray(gates.priorizado) ? gates.priorizado.length : null,
      nivel: decision.openness,
      intensidade: decision.intensity,
    });
  }

  const familyDecisions: any[] = Array.isArray(stages.family?.decisions)
    ? stages.family.decisions
    : [];
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
    });

    const statsSource = Array.isArray(entry.eligibleArms)
      ? entry.eligibleArms.find(
          (arm: any) => arm.id === (entry.tsPick ?? entry.chosen ?? null)
        )
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
    let ecoDecision: EcoDecisionResult;
    let retrieveDecision: RetrieveDecision;

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
      ecoDecision = computeEcoDecision(ultimaMsg);
      const retrieveForAnalytics = inferRetrieveMode({
        ultimaMsg,
        hints: null,
        ecoDecision,
      });

      if (preLLM.kind === "final") {
        await persistAnalyticsSafe({
          result: preLLM.result,
          retrieveMode: retrieveForAnalytics.mode,
          activationTracer,
          userId: !isGuest ? userId : null,
        });
        return preLLM.result;
      }

      const originalPreFinalize = preLLM.result.finalize;
      let preFinalizePromise: Promise<GetEcoResult> | null = null;
      const finalizeWithAnalytics = async () => {
        if (!preFinalizePromise) {
          preFinalizePromise = (async () => {
            const finalized = await originalPreFinalize();
            await persistAnalyticsSafe({
              result: finalized,
              retrieveMode: retrieveForAnalytics.mode,
              activationTracer,
              userId: !isGuest ? userId : null,
            });
            return finalized;
          })();
        }
        return preFinalizePromise;
      };

      return { ...preLLM.result, finalize: finalizeWithAnalytics };
    }

    // Decisão sobre memória e modo de conversa
    ecoDecision = computeEcoDecision(ultimaMsg);
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
    retrieveDecision = inferRetrieveMode({
      ultimaMsg,
      hints: null,
      ecoDecision,
    });

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

      await persistAnalyticsSafe({
        result: fast.response,
        retrieveMode: retrieveDecision.mode,
        activationTracer,
        userId: !isGuest ? userId : null,
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

    retrieveDecision = inferRetrieveMode({
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

    const banditDistinctId =
      sessionMeta?.distinctId ?? (isGuest ? guestId ?? undefined : userId);
    selectBanditArms({
      decision: ecoDecision,
      distinctId: banditDistinctId ?? undefined,
      userId: !isGuest ? userId : undefined,
    });

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

    logSelectorPipeline(ecoDecision, context?.sources?.mems ?? null);

    const memsSemelhantes = Array.isArray(context?.memsSemelhantes)
      ? context.memsSemelhantes
      : [];

    const { prompt, maxTokens } = buildFullPrompt({
      decision: routeDecision,
      ultimaMsg,
      systemPrompt,
      messages: thread,
    });

    const basePromptHash = sha1Hash(systemPrompt);

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
      const streamingResult = await executeStreamingLLM({
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
      });

      const originalFinalize = streamingResult.finalize;
      let finalizePromise: Promise<GetEcoResult> | null = null;
      const finalizeWithAnalytics = async () => {
        if (!finalizePromise) {
          finalizePromise = (async () => {
            const finalized = await originalFinalize();
            await persistAnalyticsSafe({
              result: finalized,
              retrieveMode: retrieveDecision.mode,
              activationTracer,
              userId: !isGuest ? userId : null,
            });
            return finalized;
          })();
        }
        return finalizePromise;
      };

      return { ...streamingResult, finalize: finalizeWithAnalytics };
    }

    // Execução completa (sem stream)
    const resultado = await executeFullLLM({
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
    });

    await persistAnalyticsSafe({
      result: resultado,
      retrieveMode: retrieveDecision.mode,
      activationTracer,
      userId: !isGuest ? userId : null,
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
