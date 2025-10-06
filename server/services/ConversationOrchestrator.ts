import {
  ensureEnvs,
  now,
  mapRoleForOpenAI,
  type GetEcoParams,
  type GetEcoResult,
  type ChatMessage,
} from "../utils";
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
}: GetEcoParams & { promptOverride?: string; metaFromBuilder?: any; stream?: EcoStreamHandler }): Promise<
  GetEcoResult | EcoStreamingResult
> {
  ensureEnvs();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Parâmetro "messages" vazio ou inválido.');
  }

  const thread: ChatMessage[] = messages;
  const lastMessage = thread.at(-1);
  const lastMessageId = lastMessage?.id;
  const ultimaMsg = lastMessage?.content ?? "";

  const streamHandler = stream ?? null;
  const timings: EcoLatencyMarks = {};

  const supabase = supabaseWithBearer(accessToken);
  const hasAssistantBeforeInThread = thread
    .slice(0, -1)
    .some((msg) => mapRoleForOpenAI(msg.role) === "assistant");

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
      streamHandler,
      clientHour,
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

  const decision = defaultConversationRouter.decide({
    messages: thread,
    ultimaMsg,
    forcarMetodoViva,
    promptOverride,
  });

  if (isDebug()) {
    log.debug("[Orchestrator] flags", {
      promptOverrideLen: (promptOverride || "").trim().length,
      low: decision.lowComplexity,
      vivaAtivo: decision.vivaAtivo,
      nivelRoteador: decision.nivelRoteador,
      ultimaLen: (ultimaMsg || "").length,
      mode: decision.mode,
    });
  }

  if (decision.mode === "fast" && !streamHandler) {
    const inicioFast = now();
    const fast = await runFastLaneLLM({
      messages: thread,
      userName: userName ?? undefined,
      ultimaMsg,
      hasAssistantBefore: decision.hasAssistantBefore,
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
    });

    return fast.response;
  }

  timings.contextBuildStart = now();
  log.info("// LATENCY: context_build_start", { at: timings.contextBuildStart });

  const { systemPrompt } = await prepareConversationContext({
    userId,
    ultimaMsg,
    supabase,
    promptOverride,
    metaFromBuilder,
    mems,
    userName,
    forcarMetodoViva,
    blocoTecnicoForcado,
    decision,
    onDerivadosError: (error) => {
      if (isDebug()) {
        const message = error instanceof Error ? error.message : String(error);
        log.debug("[Orchestrator] derivados fetch falhou", { message });
      }
    },
  });

  const { prompt, maxTokens } = buildFullPrompt({
    decision,
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

  if (streamHandler) {
    return executeStreamingLLM({
      prompt,
      maxTokens,
      principalModel,
      decision,
      ultimaMsg,
      userName,
      userId,
      supabase,
      lastMessageId: lastMessageId ?? undefined,
      sessionMeta,
      streamHandler,
      timings,
    });
  }

  return executeFullLLM({
    prompt,
    maxTokens,
    principalModel,
    ultimaMsg,
    userName,
    decision,
    userId,
    supabase,
    lastMessageId: lastMessageId ?? undefined,
    sessionMeta,
    timings,
    thread,
  });
}
