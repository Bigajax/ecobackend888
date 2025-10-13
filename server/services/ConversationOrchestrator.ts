// server/services/ConversationOrchestrator.ts
import { now, mapRoleForOpenAI, type GetEcoParams, type GetEcoResult, type ChatMessage } from "../utils";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { microReflexoLocal } from "../core/ResponseGenerator";
import { claudeChatCompletion } from "../core/ClaudeAdapter";
import { log, isDebug } from "./promptContext/logger";

import { defaultGreetingPipeline } from "./conversation/greeting";
import { defaultConversationRouter } from "./conversation/router";
import { runFastLaneLLM } from "./conversation/fastLane";
import { buildFullPrompt } from "./conversation/promptPlan";
import { defaultResponseFinalizer } from "./conversation/responseFinalizer";
import { firstName } from "./conversation/helpers";
import { computeEcoDecision } from "./conversation/ecoDecisionHub";

import { handlePreLLMShortcuts } from "./conversation/preLLMPipeline";
import { prepareConversationContext } from "./conversation/contextPreparation";
import { executeStreamingLLM } from "./conversation/streamingOrchestrator";
import { executeFullLLM } from "./conversation/fullOrchestrator";

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
        microResponder: microReflexoLocal,
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
    activationTracer?.setMemoryDecision(
      ecoDecision.saveMemory,
      ecoDecision.intensity,
      ecoDecision.saveMemory
        ? `intensity>=7 (${ecoDecision.intensity.toFixed(1)})`
        : `intensity<7 (${ecoDecision.intensity.toFixed(1)})`
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

    // Montagem de contexto (prompts, memórias, etc.)
    timings.contextBuildStart = now();
    log.info("// LATENCY: context_build_start", { at: timings.contextBuildStart });

    const { systemPrompt } = await prepareConversationContext({
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
    });

    const { prompt, maxTokens } = buildFullPrompt({
      decision: routeDecision,
      ultimaMsg,
      systemPrompt,
      messages: thread,
    });

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
