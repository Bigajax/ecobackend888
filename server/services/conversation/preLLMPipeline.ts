import type { GetEcoParams, GetEcoResult, ChatMessage } from "../../utils";

import type { EcoStreamHandler, EcoStreamingResult, EcoLatencyMarks } from "./types";
import { buildFinalizedStreamText } from "./responseMetadata";
import { computeEcoDecision } from "./ecoDecisionHub";

interface PreLLMShortcutsParams {
  thread: ChatMessage[];
  ultimaMsg: string;
  userId: string;
  userName?: string | null;
  supabase: any;
  hasAssistantBefore: boolean;
  lastMessageId?: string;
  sessionMeta?: GetEcoParams["sessionMeta"];
  streamHandler?: EcoStreamHandler | null;
  clientHour?: number;
  isGuest?: boolean;
  guestId?: string;
}

interface PreLLMShortcutsDeps {
  greetingPipeline: typeof import("./greeting")["defaultGreetingPipeline"];
  responseFinalizer: typeof import("./responseFinalizer")["defaultResponseFinalizer"];
  now: typeof import("../../utils")["now"];
}

type PreLLMHandled =
  | { kind: "final"; result: GetEcoResult }
  | { kind: "stream"; result: EcoStreamingResult };

export async function handlePreLLMShortcuts(
  params: PreLLMShortcutsParams,
  deps: PreLLMShortcutsDeps
): Promise<PreLLMHandled | null> {
  const {
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
    isGuest = false,
    guestId,
  } = params;
  const { greetingPipeline, responseFinalizer, now } = deps;

  const startedAt = now();
  const ecoDecision = computeEcoDecision(ultimaMsg);

  const greetingResult = greetingPipeline.handle({
    messages: thread,
    ultimaMsg,
    userId,
    userName: userName ?? undefined,
    clientHour,
    greetingEnabled: process.env.ECO_GREETING_BACKEND_ENABLED !== "0",
  });

  if (greetingResult.handled && greetingResult.response) {
    const finalized = await responseFinalizer.finalize({
      raw: greetingResult.response,
      ultimaMsg,
      userName: userName ?? undefined,
      hasAssistantBefore,
      userId,
      supabase,
      lastMessageId,
      mode: "fast",
      startedAt: now(),
      usageTokens: undefined,
      modelo: "greeting",
      sessionMeta,
      sessaoId: sessionMeta?.sessaoId ?? undefined,
      origemSessao: sessionMeta?.origem ?? undefined,
      ecoDecision,
      moduleCandidates: ecoDecision.debug.modules,
      selectedModules: ecoDecision.debug.selectedModules,
      isGuest,
      guestId,
    });

    return streamHandler
      ? {
          kind: "stream",
          result: await emitImmediateStream({
            streamHandler,
            finalized,
            modelo: "greeting",
          }),
        }
      : { kind: "final", result: finalized };
  }

  return null;
}

async function emitImmediateStream({
  streamHandler,
  finalized,
  modelo,
}: {
  streamHandler: EcoStreamHandler;
  finalized: GetEcoResult;
  modelo: string;
}): Promise<EcoStreamingResult> {
  const finalText = buildFinalizedStreamText(finalized);

  // Debug: log the greeting response
  if (process.env.ECO_DEBUG === "1" || process.env.ECO_DEBUG === "true") {
    console.debug("[preLLMPipeline] emitImmediateStream", {
      modelo,
      hasMessage: !!finalized.message,
      messageLength: typeof finalized.message === "string" ? finalized.message.length : 0,
      finalTextLength: finalText.length,
      finalText: finalText.slice(0, 200),
    });
  }

  const timings: EcoLatencyMarks = {};
  await streamHandler.onEvent({ type: "control", name: "prompt_ready", timings });

  // IMPORTANTE: Sempre emitir um chunk, mesmo que vazio
  // Caso contrário, o frontend recebe "NO_CHUNKS_EMITTED" erro
  const textToEmit = finalText || (finalized.message || "👋");

  await streamHandler.onEvent({ type: "chunk", delta: textToEmit, index: 0 });

  await streamHandler.onEvent({
    type: "control",
    name: "done",
    meta: { length: textToEmit.length, modelo },
    timings,
  });

  const finalize = async () => finalized;
  return {
    raw: textToEmit,
    modelo,
    usage: undefined,
    finalize,
    timings,
  };
}
