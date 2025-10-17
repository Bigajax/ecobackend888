import { streamClaudeChatCompletion, type Msg } from "../../core/ClaudeAdapter";
import { log } from "../promptContext/logger";
import { now } from "../../utils";

import {
  EcoStreamHandler,
  EcoStreamingResult,
  EcoLatencyMarks,
  EcoStreamEvent,
} from "./types";
import { buildStreamingMetaPayload, buildFinalizedStreamText } from "./responseMetadata";
import { salvarMemoriaViaRPC } from "./memoryPersistence";
import { defaultResponseFinalizer, type PrecomputedFinalizeArtifacts } from "./responseFinalizer";
import type { EcoDecisionResult } from "./ecoDecisionHub";

import { executeFullLLM } from "./fullOrchestrator";
import type { ChatMessage, GetEcoResult } from "../../utils";
import type { EcoHints } from "../../utils/types";

const BLOCO_DEADLINE_MS = Number(process.env.ECO_BLOCO_DEADLINE_MS ?? 5000);
const BLOCO_PENDING_MS = Number(process.env.ECO_BLOCO_PENDING_MS ?? 1000);
const STREAM_GUARD_MS = Number(process.env.ECO_STREAM_GUARD_MS ?? 4000);

function normalizeBlocoForMeta(
  bloco: any,
  ecoDecision: EcoDecisionResult,
  cleaned: string
) {
  const payload = bloco && typeof bloco === "object" ? { ...bloco } : {};
  payload.intensidade = ecoDecision.intensity;
  if (typeof payload.analise_resumo !== "string" || !payload.analise_resumo.trim()) {
    payload.analise_resumo = cleaned;
  } else {
    payload.analise_resumo = payload.analise_resumo.trim();
  }
  if (typeof payload.emocao_principal !== "string" || !payload.emocao_principal.trim()) {
    payload.emocao_principal = "indefinida";
  }
  if (!Array.isArray(payload.tags)) {
    payload.tags = [];
  }
  payload.categoria =
    typeof payload.categoria === "string" && payload.categoria.trim().length
      ? payload.categoria.trim()
      : null;
  return payload;
}

interface StreamingExecutionParams {
  prompt: Msg[];
  maxTokens: number;
  principalModel: string;
  decision: { hasAssistantBefore: boolean };
  ecoDecision: EcoDecisionResult;
  ultimaMsg: string;
  userName?: string | null;
  userId: string;
  supabase: any | null;
  lastMessageId?: string;
  sessionMeta?: any;
  streamHandler: EcoStreamHandler;
  timings: EcoLatencyMarks;
  isGuest?: boolean;
  guestId?: string;
  thread: ChatMessage[];
  calHints?: EcoHints | null;
  memsSemelhantes?: any[];
  contextFlags?: Record<string, unknown>;
  contextMeta?: Record<string, unknown>;
  continuity?: {
    hasContinuity: boolean;
    memoryRef: Record<string, unknown> | null;
    similarity?: number | null;
    diasDesde?: number | null;
  };
}

export async function executeStreamingLLM({
  prompt,
  maxTokens,
  principalModel,
  decision,
  ecoDecision,
  ultimaMsg,
  userName,
  userId,
  supabase,
  lastMessageId,
  sessionMeta,
  streamHandler,
  timings,
  isGuest = false,
  guestId,
  thread,
  calHints,
  memsSemelhantes,
  contextFlags,
  contextMeta,
  continuity,
}: StreamingExecutionParams): Promise<EcoStreamingResult> {
  const supabaseClient = supabase ?? null;
  const summarizeDelta = (input: string) => {
    const safe = input ?? "";
    const normalized = safe.replace(/\s+/g, " ").trim();
    if (normalized.length <= 60) return normalized;
    return `${normalized.slice(0, 57)}...`;
  };

  const emitStream = async (event: EcoStreamEvent) => {
    const payloadForLog: Record<string, unknown> = { type: event.type };
    if (event.type === "chunk" || event.type === "first_token") {
      const delta = event.type === "chunk" ? event.delta : event.delta;
      payloadForLog.delta = summarizeDelta(delta);
      if (event.type === "chunk" && typeof event.index === "number") {
        payloadForLog.index = event.index;
      }
    } else if (event.type === "control") {
      payloadForLog.name = event.name;
    } else if (event.type === "error") {
      payloadForLog.message = event.error?.message;
    }

    log.info("[StreamingLLM] emit_event", payloadForLog);
    await streamHandler.onEvent(event);
  };

  const streamedChunks: string[] = [];
  let chunkIndex = 0;
  let firstTokenSent = false;
  let usageFromStream: any;
  let finishReason: string | null | undefined;
  let modelFromStream: string | null | undefined;
  let streamFailure: Error | null = null;
  let ignoreStreamEvents = false;
  let fallbackResult: EcoStreamingResult | null = null;

  let resolveRawForBloco!: (value: string) => void;
  let rejectRawForBloco!: (reason?: unknown) => void;
  const rawForBlocoPromise = new Promise<string>((resolve, reject) => {
    resolveRawForBloco = resolve;
    rejectRawForBloco = reject;
  });

  type StreamingBlocoArtifacts = {
    normalized: import("./responseFinalizer").NormalizedEcoResponse;
    blocoPromise: Promise<any | null>;
    blocoRacePromise: Promise<any | null>;
  };

  let blocoSetupPromise: Promise<StreamingBlocoArtifacts> | null = null;
  let blocoPendingTimer: NodeJS.Timeout | null = null;
  let blocoDeadlineTimer: NodeJS.Timeout | null = null;

  const startBlocoPipeline = () => {
    if (!ecoDecision.hasTechBlock) return;
    if (blocoSetupPromise) return;
    blocoSetupPromise = (async () => {
      try {
        const rawForBloco = await rawForBlocoPromise;
        const normalized = defaultResponseFinalizer.normalizeRawResponse({
          raw: rawForBloco,
          userName: userName ?? undefined,
          hasAssistantBefore: decision.hasAssistantBefore,
          mode: "full",
        });

        const blocoTimeout = defaultResponseFinalizer.gerarBlocoComTimeout({
          ultimaMsg,
          blocoTarget: normalized.blocoTarget,
          mode: "full",
          skipBloco: false,
          distinctId: sessionMeta?.distinctId ?? userId,
          userId,
          intensidade: ecoDecision.intensity,
        });

        const blocoPromise = blocoTimeout.full;
        const blocoRacePromise = blocoTimeout.race;

        let settled = false;
        let deadlineExceeded = false;
        const blocoStartedAt = now();

        const clearPending = () => {
          if (blocoPendingTimer) {
            clearTimeout(blocoPendingTimer);
            blocoPendingTimer = null;
          }
        };

        const clearDeadline = () => {
          if (blocoDeadlineTimer) {
            clearTimeout(blocoDeadlineTimer);
            blocoDeadlineTimer = null;
          }
        };

        blocoPromise
          .catch(() => undefined)
          .finally(() => {
            settled = true;
            clearPending();
            clearDeadline();
          });

        blocoPendingTimer = setTimeout(() => {
          if (settled || deadlineExceeded) return;
          log.info("[StreamingBloco] state=pending", {
            pendingMs: BLOCO_PENDING_MS,
            deadlineMs: BLOCO_DEADLINE_MS,
          });
          void emitStream({ type: "control", name: "meta_pending" });
          blocoPendingTimer = null;
        }, BLOCO_PENDING_MS);

        blocoDeadlineTimer = setTimeout(() => {
          if (settled) return;
          deadlineExceeded = true;
          clearPending();
          log.warn("[StreamingBloco] state=deadline_exceeded", {
            deadlineMs: BLOCO_DEADLINE_MS,
          });
          blocoDeadlineTimer = null;
        }, BLOCO_DEADLINE_MS);

        blocoRacePromise
          .then(async (payload) => {
            if (deadlineExceeded) return;

            const durationMs = now() - blocoStartedAt;
            if (!payload) {
              log.info("[StreamingBloco] state=success", { durationMs, emitted: false });
              return;
            }

            const normalizedPayload = normalizeBlocoForMeta(payload, ecoDecision, normalized.cleaned);
            const metaPayload = buildStreamingMetaPayload(normalizedPayload, normalized.cleaned);
            if (!metaPayload) {
              log.warn("[StreamingBloco] bloco payload inválido; meta não emitido", { durationMs });
              return;
            }

            log.info("[StreamingBloco] state=success", { durationMs, emitted: true });
            await emitStream({ type: "control", name: "meta", meta: metaPayload });

            if (!isGuest && supabaseClient) {
              try {
                const rpcRes = await salvarMemoriaViaRPC({
                  supabase: supabaseClient,
                  userId,
                  mensagemId: lastMessageId ?? null,
                  meta: metaPayload,
                  origem: "streaming_bloco",
                });

                if (rpcRes.saved && rpcRes.memoriaId) {
                  await emitStream({
                    type: "control",
                    name: "memory_saved",
                    meta: {
                      memoriaId: rpcRes.memoriaId,
                      primeiraMemoriaSignificativa: !!rpcRes.primeira,
                      intensidade: metaPayload.intensidade,
                    },
                  });
                }
              } catch (error: any) {
                log.warn("[StreamingBloco] salvarMemoriaViaRPC falhou (ignorado)", {
                  message: error?.message,
                });
              }
            }
          })
          .catch((error) => {
            if (deadlineExceeded) return;
            const message = error instanceof Error ? error.message : String(error);
            log.warn("[StreamingBloco] bloco promise rejected", { message });
          });

        return { normalized, blocoPromise, blocoRacePromise };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("[StreamingBloco] failed to start bloco", { message });
        throw error;
      }
    })();
  };

  const clearStreamGuard = (timer: NodeJS.Timeout | null) => {
    if (timer) {
      clearTimeout(timer);
    }
  };

  const deliverFallbackFull = async () => {
    if (fallbackResult) {
      return fallbackResult;
    }

    ignoreStreamEvents = true;
    log.info("[StreamingLLM] guard_fallback_trigger", { guardMs: STREAM_GUARD_MS });

    const fallbackTimings: EcoLatencyMarks = { ...timings };

    const fullResult = await executeFullLLM({
      prompt,
      maxTokens,
      principalModel,
      ultimaMsg,
      userName,
      decision,
      ecoDecision,
      userId,
      supabase,
      lastMessageId,
      sessionMeta,
      timings: fallbackTimings,
      thread,
      isGuest,
      guestId,
      calHints,
      memsSemelhantes,
      contextFlags,
      contextMeta,
      continuity,
    });

    const text = buildFinalizedStreamText(fullResult);
    Object.assign(timings, fallbackTimings);
    resolveRawForBloco(text);
    streamedChunks.length = 0;
    streamedChunks.push(text);

    const tokens = Array.from(text);
    if (!firstTokenSent) {
      firstTokenSent = true;
    }
    const firstDelta = tokens.shift() ?? "";
    if (firstDelta) {
      await emitStream({ type: "first_token", delta: firstDelta });
    }
    const rest = tokens.join("");
    if (rest) {
      const currentIndex = chunkIndex;
      chunkIndex += 1;
      await emitStream({ type: "chunk", delta: rest, index: currentIndex });
    }

    const doneSnapshot = { ...fallbackTimings };
    fallbackResult = {
      raw: text,
      modelo: "fallback_full",
      usage: undefined,
      finalize: async () => fullResult,
      timings: doneSnapshot,
    };

    await emitStream({
      type: "control",
      name: "done",
      meta: {
        finishReason: "fallback_full",
        length: text.length,
        modelo: "fallback_full",
      },
      timings: doneSnapshot,
    });

    return fallbackResult;
  };

  let streamGuardTimer: NodeJS.Timeout | null = null;

  const armStreamGuard = (): Promise<"fallback" | "guard_disabled"> => {
    if (!Number.isFinite(STREAM_GUARD_MS) || STREAM_GUARD_MS <= 0) {
      return Promise.resolve<"guard_disabled">("guard_disabled");
    }

    return new Promise<"fallback">((resolve) => {
      streamGuardTimer = setTimeout(() => {
        streamGuardTimer = null;
        void deliverFallbackFull().then(() => resolve("fallback"));
      }, STREAM_GUARD_MS);
    });
  };

  timings.llmStart = now();
  log.info("// LATENCY: llm_request_start", {
    at: timings.llmStart,
    sincePromptReadyMs:
      timings.contextBuildEnd && timings.llmStart
        ? timings.llmStart - timings.contextBuildEnd
        : undefined,
  });

  const streamPromise = streamClaudeChatCompletion(
    {
      messages: prompt,
      model: principalModel,
      temperature: 0.6,
      maxTokens,
    },
    {
      async onChunk({ content }) {
        if (!content) return;
        if (ignoreStreamEvents) return;
        streamedChunks.push(content);
        if (streamGuardTimer) {
          clearStreamGuard(streamGuardTimer);
          streamGuardTimer = null;
        }
        const tokens = Array.from(content);
        if (!firstTokenSent) {
          firstTokenSent = true;
          const firstDelta = tokens.shift() ?? "";
          if (firstDelta) {
            await emitStream({ type: "first_token", delta: firstDelta });
          }
          const rest = tokens.join("");
          if (rest) {
            const currentIndex = chunkIndex;
            chunkIndex += 1;
            await emitStream({ type: "chunk", delta: rest, index: currentIndex });
          }
          return;
        }
        const currentIndex = chunkIndex;
        chunkIndex += 1;
        await emitStream({ type: "chunk", delta: content, index: currentIndex, content });
      },
      async onControl(event) {
        if (ignoreStreamEvents) return;
        if (event.type === "reconnect") {
          await emitStream({ type: "control", name: "reconnect", attempt: event.attempt });
          return;
        }
        if (event.type === "done") {
          if (streamGuardTimer) {
            clearStreamGuard(streamGuardTimer);
            streamGuardTimer = null;
          }
          usageFromStream = event.usage ?? usageFromStream;
          finishReason = event.finishReason ?? finishReason;
          modelFromStream = event.model ?? modelFromStream;
        }
      },
      async onError(error) {
        if (ignoreStreamEvents) return;
        streamFailure = error;
        rejectRawForBloco(error);
        await emitStream({ type: "error", error });
      },
    }
  ).catch((error: any) => {
    const err = error instanceof Error ? error : new Error(String(error));
    streamFailure = err;
    rejectRawForBloco(err);
    throw err;
  });

  startBlocoPipeline();

  await emitStream({ type: "control", name: "prompt_ready", timings: { ...timings } });

  let streamCompleted = false;

  const guardPromise = armStreamGuard();

  const raceOutcome = await Promise.race<"stream" | "fallback" | "guard_disabled">([
    streamPromise.then(() => {
      streamCompleted = true;
      return "stream" as const;
    }),
    guardPromise,
  ]);

  if (raceOutcome === "fallback") {
    void streamPromise.catch(() => undefined);
    return fallbackResult ?? (await deliverFallbackFull());
  }

  if (raceOutcome === "guard_disabled") {
    await streamPromise;
    streamCompleted = true;
  }

  try {
    if (!streamCompleted) {
      await streamPromise;
      streamCompleted = true;
    }
  } finally {
    if (!streamGuardTimer) {
      // already cleared
    } else {
      clearStreamGuard(streamGuardTimer);
      streamGuardTimer = null;
    }
    timings.llmEnd = now();
    log.info("// LATENCY: llm_request_end", {
      at: timings.llmEnd,
      durationMs:
        timings.llmStart && timings.llmEnd ? timings.llmEnd - timings.llmStart : undefined,
    });
  }

  if (streamFailure) {
    throw streamFailure;
  }

  const raw = streamedChunks.join("");
  resolveRawForBloco(raw);

  let finalizePromise: Promise<GetEcoResult> | null = null;
  const computeFinalization = () => {
    if (!finalizePromise) {
      finalizePromise = (async () => {
        let precomputed: PrecomputedFinalizeArtifacts | undefined;
        if (blocoSetupPromise) {
          try {
            const artifacts = await blocoSetupPromise;
            precomputed = {
              normalized: artifacts.normalized,
              blocoPromise: artifacts.blocoPromise,
              blocoRacePromise: artifacts.blocoRacePromise,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.warn("[StreamingBloco] finalize ignoring precomputed bloco", { message });
          }
        }

        return defaultResponseFinalizer.finalize({
          raw,
          ultimaMsg,
          userName: userName ?? undefined,
          hasAssistantBefore: decision.hasAssistantBefore,
          userId,
          supabase: supabaseClient ?? undefined,
          lastMessageId,
          mode: "full",
          startedAt: timings.llmStart ?? now(),
          usageTokens: usageFromStream?.total_tokens ?? undefined,
          modelo: modelFromStream ?? principalModel,
          sessionMeta,
          sessaoId: sessionMeta?.sessaoId ?? undefined,
          origemSessao: sessionMeta?.origem ?? undefined,
          precomputed,
          moduleCandidates: ecoDecision.debug.modules,
          selectedModules: ecoDecision.debug.selectedModules,
          timingsSnapshot: timings,
          ecoDecision,
          isGuest,
          guestId,
          calHints,
          memsSemelhantes,
          promptMessages: prompt,
          promptTokens: usageFromStream?.prompt_tokens,
          completionTokens: usageFromStream?.completion_tokens,
          contextFlags,
          contextMeta,
          continuity,
        });
      })();
    }
    return finalizePromise;
  };

  const finalize = () => computeFinalization();

  let interactionIdForMeta: string | null = null;
  try {
    const finalized = await computeFinalization();
    const metaFromResult = finalized?.meta as Record<string, unknown> | null | undefined;
    const maybeInteraction =
      typeof metaFromResult?.interaction_id === "string"
        ? metaFromResult.interaction_id.trim()
        : "";
    interactionIdForMeta = maybeInteraction ? maybeInteraction : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("[StreamingLLM] finalize_failed_before_done", { message });
  }

  const doneSnapshot = { ...timings };
  const finalFinishReason = finishReason ?? "stream_done";
  log.info("[StreamingLLM] stream_done", {
    length: raw.length,
    chunks: chunkIndex,
    finishReason: finalFinishReason,
  });
  const doneMeta: Record<string, unknown> = {
    finishReason: finalFinishReason,
    usage: usageFromStream,
    modelo: modelFromStream ?? principalModel,
    length: raw.length,
    interaction_id: interactionIdForMeta,
  };
  await emitStream({
    type: "control",
    name: "done",
    meta: doneMeta,
    timings: doneSnapshot,
  });

  return {
    raw,
    modelo: modelFromStream ?? principalModel,
    usage: usageFromStream,
    finalize,
    timings: doneSnapshot,
  };
}
