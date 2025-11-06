import { streamClaudeChatCompletion, type Msg } from "../../core/ClaudeAdapter";
import { log } from "../promptContext/logger";
import { now } from "../../utils";
import { sha1Hash } from "./interactionAnalytics";

import {
  EcoStreamHandler,
  EcoStreamingResult,
  EcoLatencyMarks,
  EcoStreamEvent,
  EcoStreamChunkPayload,
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
const STREAM_GUARD_MS = Number(process.env.ECO_STREAM_GUARD_MS ?? 2000);
const FIRST_TOKEN_TIMEOUT_MS = Number(process.env.ECO_FIRST_TOKEN_TIMEOUT_MS ?? 15000);

function once<T extends (...args: any[]) => any>(fn: T): T {
  let hasBeenCalled = false;
  let result: any;
  return ((...args: any[]) => {
    if (!hasBeenCalled) {
      hasBeenCalled = true;
      result = fn(...args);
    }
    return result;
  }) as T;
}

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
  basePrompt: string;
  basePromptHash?: string | null;
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
  interactionId?: string | null;
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
  abortSignal?: AbortSignal;
}

export async function executeStreamingLLM({
  prompt,
  maxTokens,
  principalModel,
  decision,
  ecoDecision,
  ultimaMsg,
  basePrompt,
  basePromptHash,
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
  interactionId,
  calHints,
  memsSemelhantes,
  contextFlags,
  contextMeta,
  continuity,
  abortSignal,
}: StreamingExecutionParams): Promise<EcoStreamingResult> {
  console.log("[ECO-SSE] início streaming", { timestamp: new Date().toISOString() });
  const supabaseClient = supabase ?? null;
  const resolvedPromptHash =
    typeof basePromptHash === "string" && basePromptHash
      ? basePromptHash
      : sha1Hash(basePrompt);
  const analyticsInteractionId = interactionId ?? null;
  const chunkDispatcher =
    streamHandler && typeof streamHandler.onChunk === "function"
      ? streamHandler.onChunk.bind(streamHandler)
      : null;

  let emittedChunkCount = 0;

  const emitStream = async (event: EcoStreamEvent) => {
    const payloadForLog: Record<string, unknown> = { type: event.type };
    if (event.type === "chunk") {
      payloadForLog.delta = event.delta;
      if (typeof event.index === "number") {
        payloadForLog.index = event.index;
      }
      const previewSource =
        typeof event.delta === "string" && event.delta.length
          ? event.delta
          : typeof event.content === "string"
            ? event.content
            : "";
      emittedChunkCount += 1;
      console.log("[ECO-SSE] chunk enviado", {
        num: emittedChunkCount,
        preview: previewSource.slice(0, 30),
      });
    } else if (event.type === "control") {
      payloadForLog.name = event.name;
      if (event.name === "done") {
        console.log("[ECO-SSE] done emitido");
      }
    } else if (event.type === "error") {
      payloadForLog.message = event.error?.message;
    }

    log.info("[StreamingLLM] emit_event", payloadForLog);

    if (event.type === "chunk" && chunkDispatcher) {
      const payloadText =
        typeof event.content === "string" && event.content.length
          ? event.content
          : event.delta;
      await chunkDispatcher({ index: event.index, text: payloadText });
    }

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
  let fallbackEmitted = false;
  let sawChunk = false;

  const emitFallbackOnce = once(async () => {
    try {
      const fallbackTimings: EcoLatencyMarks = { ...timings };
      const fullResult = await executeFullLLM({
        prompt,
        maxTokens,
        principalModel,
        ultimaMsg,
        basePrompt,
        basePromptHash: resolvedPromptHash,
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
        interactionId: analyticsInteractionId ?? undefined,
        calHints,
        memsSemelhantes,
        contextFlags,
        contextMeta,
        continuity,
      });
      const text = buildFinalizedStreamText(fullResult);
      const fallbackText = text?.trim() || "Estou processando sua mensagem...";
      // Sempre emite pelo menos um chunk
      await onChunk({ index: chunkIndex, text: fallbackText });
      sawChunk = true;
      chunkIndex += 1;
      await onChunk({ done: true, meta: { finishReason: "fallback" } });
      return true;
    } catch (error) {
      // Mesmo em caso de erro, emitir um chunk antes de retornar
      const errorText = "Desculpe, tive dificuldade para processar. Pode tentar novamente?";
      if (!sawChunk) {
        await onChunk({ index: chunkIndex, text: errorText });
        sawChunk = true;
        chunkIndex += 1;
      }
      return false;
    }
  });

  const onChunk = async (payload: EcoStreamChunkPayload) => {
    if (chunkDispatcher) {
      await chunkDispatcher(payload);
      return;
    }
    const text = typeof payload.text === "string" ? payload.text : "";
    if (text) {
      // marca que houve chunk
      sawChunk = true;
      const resolvedIndex =
        typeof payload.index === "number" && Number.isFinite(payload.index)
          ? payload.index
          : chunkIndex;
      // garante consistência de index e contagem global
      chunkIndex = Math.max(chunkIndex, (resolvedIndex ?? 0)) + 1;
      streamedChunks.push(text);
      await streamHandler.onEvent({
        type: "chunk",
        delta: text,
        index: resolvedIndex,
        content: text,
      } as EcoStreamEvent);
    }
    if (payload.done) {
      // Garantir que pelo menos um chunk foi emitido antes de enviar done
      if (!sawChunk && !text) {
        log.warn("[onChunk] emitindo chunk padrão antes de done", {
          sawChunk,
          chunkIndex,
        });
        const defaultText = "Estou aqui para você.";
        sawChunk = true;
        streamedChunks.push(defaultText);
        await streamHandler.onEvent({
          type: "chunk",
          delta: defaultText,
          index: chunkIndex,
          content: defaultText,
        } as EcoStreamEvent);
        chunkIndex += 1;
      }
      await streamHandler.onEvent({
        type: "control",
        name: "done",
        meta: payload.meta as any,
      } as EcoStreamEvent);
    }
  };

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
    fallbackEmitted = true;

    await onChunk({ index: chunkIndex, text: "Processando...", meta: { fallback: true } });

    try {
      ignoreStreamEvents = true;
      await emitStream({
        type: "control",
        name: "guard_fallback_trigger",
        meta: {
          from: principalModel,
          to: "fallback_full",
          reason: "stream_guard",
        },
      });
      log.info("[StreamingLLM] guard_fallback_trigger", { guardMs: STREAM_GUARD_MS });

      const fallbackTimings: EcoLatencyMarks = { ...timings };

      const fullResult = await executeFullLLM({
        prompt,
        maxTokens,
        principalModel,
        ultimaMsg,
        basePrompt,
        basePromptHash: resolvedPromptHash,
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
        interactionId: analyticsInteractionId ?? undefined,
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

      if (!firstTokenSent) {
        firstTokenSent = true;
      }
      // Emite via onChunk para manter contadores e flags
      await onChunk({ index: chunkIndex, text });

      const doneSnapshot = { ...fallbackTimings };
      fallbackResult = {
        raw: text,
        modelo: "fallback_full",
        usage: undefined,
        finalize: async () => fullResult,
        timings: doneSnapshot,
      };

      await onChunk({
        done: true,
        meta: {
          finishReason: "fallback_full",
          length: text.length,
          modelo: "fallback_full",
        },
      });

      return fallbackResult;
    } catch (error) {
      // Garantir que pelo menos um chunk seja emitido antes do done
      const errorMessage = "Desculpe, houve um problema ao processar sua mensagem.";
      if (!sawChunk) {
        await onChunk({ index: chunkIndex, text: errorMessage });
        sawChunk = true;
        chunkIndex += 1;
      }
      await onChunk({ done: true, meta: { error: "fallback_failed" } });
      throw error;
    }
  };

  let streamGuardTimer: NodeJS.Timeout | null = null;

  // ===== WORD-BOUNDARY BUFFERING =====
  // Accumulates tokens until word boundary or max size to prevent micro-chunks
  let wordBuffer = "";
  let lastFlushTime = Date.now();
  const WORD_BUFFER_MAX_SIZE = 50; // chars
  const WORD_FLUSH_DEBOUNCE_MS = 100; // time-based flush

  const shouldFlushWordBuffer = (): boolean => {
    if (!wordBuffer) return false;
    // Check if buffer ends with natural boundary
    const endsWithBoundary = /[\s.,!?;:\-—\n]\s*$/.test(wordBuffer);
    const bufferTooLarge = wordBuffer.length >= WORD_BUFFER_MAX_SIZE;
    const timeoutExceeded = Date.now() - lastFlushTime >= WORD_FLUSH_DEBOUNCE_MS;
    return endsWithBoundary || bufferTooLarge || timeoutExceeded;
  };

  const flushWordBuffer = async (): Promise<void> => {
    if (!wordBuffer) return;
    const toEmit = wordBuffer;
    wordBuffer = "";
    lastFlushTime = Date.now();
    // Emit as a single chunk event
    const currentIndex = chunkIndex;
    chunkIndex += 1;
    streamedChunks.push(toEmit);
    await emitStream({ type: "chunk", delta: toEmit, index: currentIndex, content: toEmit });
  };
  // ===== END WORD-BOUNDARY BUFFERING =====

  const cleanupAbortListener = (() => {
    if (!abortSignal) {
      return null as (() => void) | null;
    }
    const onAbort = () => {
      ignoreStreamEvents = true;
      if (streamGuardTimer) {
        clearStreamGuard(streamGuardTimer);
        streamGuardTimer = null;
      }
    };
    abortSignal.addEventListener("abort", onAbort);
    return () => abortSignal.removeEventListener("abort", onAbort);
  })();

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

  const firstTokenTimer = setTimeout(async () => {
    if (!sawChunk) {
      log.warn("[first_token_guard_triggered]", { sawChunk, chunksCount: chunkIndex });
      await emitFallbackOnce();
    }
  }, FIRST_TOKEN_TIMEOUT_MS);

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
        sawChunk = true;
        // Add to internal accumulated chunks for finalization
        streamedChunks.push(content);
        if (streamGuardTimer) {
          clearStreamGuard(streamGuardTimer);
          streamGuardTimer = null;
        }
        if (!firstTokenSent) {
          firstTokenSent = true;
        }
        // ===== WORD-BOUNDARY BUFFERING: Accumulate instead of emitting immediately =====
        wordBuffer += content;
        if (shouldFlushWordBuffer()) {
          await flushWordBuffer();
        }
        // ===== END WORD-BOUNDARY BUFFERING =====
      },
      async onControl(event) {
        if (ignoreStreamEvents) return;
        if (event.type === "reconnect") {
          await emitStream({ type: "control", name: "reconnect", attempt: event.attempt });
          return;
        }
        if (event.type === "done") {
          // ===== WORD-BOUNDARY BUFFERING: Flush remaining buffer before finishing =====
          await flushWordBuffer();
          // ===== END WORD-BOUNDARY BUFFERING =====
          if (streamGuardTimer) {
            clearStreamGuard(streamGuardTimer);
            streamGuardTimer = null;
          }
          if (!sawChunk) {
            log.warn("[first_token_guard_triggered]", { sawChunk, chunksCount: chunkIndex });
            await emitFallbackOnce();
          }
          usageFromStream = event.usage ?? usageFromStream;
          finishReason = event.finishReason ?? finishReason;
          modelFromStream = event.model ?? modelFromStream;
        }
      },
      onFallback: () => {
        fallbackEmitted = true;
      },
      async onError(error) {
        if (ignoreStreamEvents) return;
        streamFailure = error;
        rejectRawForBloco(error);
        await emitStream({ type: "error", error });
      },
    },
    { externalSignal: abortSignal }
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
    clearTimeout(firstTokenTimer);
    if (!streamGuardTimer) {
      // already cleared
    } else {
      clearStreamGuard(streamGuardTimer);
      streamGuardTimer = null;
    }
    cleanupAbortListener?.();
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
          interactionId: analyticsInteractionId ?? undefined,
          promptHash: resolvedPromptHash,
        });
      })();
    }
    return finalizePromise;
  };

  const finalize = () => computeFinalization();

  try {
    const finalized = await computeFinalization();
    const metaFromResult = finalized?.meta as Record<string, unknown> | null | undefined;
    const interactionIdFromResult =
      typeof metaFromResult?.interaction_id === "string"
        ? metaFromResult.interaction_id.trim()
        : null;

    if (interactionIdFromResult && interactionIdFromResult !== analyticsInteractionId) {
      log.debug("[StreamingLLM] interaction_id_mismatch", {
        source: analyticsInteractionId,
        fromFinalize: interactionIdFromResult,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("[StreamingLLM] finalize_failed_before_done", { message });
  }

  const doneSnapshot = { ...timings };
  const finalFinishReason = finishReason ?? "stream_done";
  if (chunkIndex === 0 && !sawChunk) return fallbackResult ?? (await deliverFallbackFull());

  // Garantir que pelo menos um chunk foi emitido antes de enviar done
  if (!sawChunk || chunkIndex === 0) {
    log.warn("[StreamingLLM] garantindo emissão de chunk antes de done", {
      sawChunk,
      chunkIndex,
      rawLength: raw.length,
    });

    const fallbackText = raw?.trim() || "Processando sua mensagem...";
    await emitStream({
      type: "chunk",
      delta: fallbackText,
      index: chunkIndex,
      content: fallbackText,
    });
    sawChunk = true;
    chunkIndex += 1;
  }

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
    interaction_id: analyticsInteractionId,
    guardFallback: fallbackEmitted,
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
