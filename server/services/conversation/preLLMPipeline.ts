import type { GetEcoParams, GetEcoResult, ChatMessage } from "../../utils";

import type {
  EcoStreamHandler,
  EcoStreamingResult,
  EcoLatencyMarks,
} from "./types";
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
  microResponder: typeof import("../../core/ResponseGenerator")["microReflexoLocal"];
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
  const { microResponder, greetingPipeline, responseFinalizer, now } = deps;

  const startedAt = now();
  const ecoDecision = computeEcoDecision(ultimaMsg);
  const maybeMicro = microResponder(ultimaMsg);
  if (maybeMicro) {
    const finalized = await responseFinalizer.finalize({
      raw: maybeMicro,
      ultimaMsg,
      userName: userName ?? undefined,
      hasAssistantBefore,
      userId,
      supabase,
      lastMessageId,
      mode: "fast",
      startedAt,
      usageTokens: undefined,
      modelo: "micro-reflexo",
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
            modelo: "micro-reflexo",
          }),
        }
      : { kind: "final", result: finalized };
  }

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

  const timings: EcoLatencyMarks = {};
  await streamHandler.onEvent({ type: "control", name: "prompt_ready", timings });
  const tokens = Array.from(finalText);
  const first = tokens.shift() ?? "";
  if (first) {
    await streamHandler.onEvent({ type: "first_token", delta: first });
  }
  const rest = tokens.join("");
  if (rest) {
    await streamHandler.onEvent({ type: "chunk", delta: rest, index: 0 });
  }
  await streamHandler.onEvent({
    type: "control",
    name: "done",
    meta: { length: finalText.length, modelo },
    timings,
  });

  const finalize = async () => finalized;
  return {
    raw: finalText,
    modelo,
    usage: undefined,
    finalize,
    timings,
  };
}
