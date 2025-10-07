import { streamClaudeChatCompletion, type Msg } from "../../core/ClaudeAdapter";
import { log } from "../promptContext/logger";
import { now } from "../../utils";

import {
  EcoStreamHandler,
  EcoStreamingResult,
  EcoLatencyMarks,
  EcoStreamEvent,
} from "./types";
import { buildStreamingMetaPayload } from "./responseMetadata";
import { salvarMemoriaViaRPC } from "./memoryPersistence";
import { defaultResponseFinalizer, type PrecomputedFinalizeArtifacts } from "./responseFinalizer";

import type { GetEcoResult } from "../../utils";

const BLOCO_DEADLINE_MS = Number(process.env.ECO_BLOCO_DEADLINE_MS ?? 5000);
const BLOCO_PENDING_MS = Number(process.env.ECO_BLOCO_PENDING_MS ?? 1000);

interface StreamingExecutionParams {
  prompt: Msg[];
  maxTokens: number;
  principalModel: string;
  decision: { hasAssistantBefore: boolean };
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
}

export async function executeStreamingLLM({
  prompt,
  maxTokens,
  principalModel,
  decision,
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
}: StreamingExecutionParams): Promise<EcoStreamingResult> {
  const supabaseClient = supabase ?? null;
  const emitStream = async (event: EcoStreamEvent) => {
    await streamHandler.onEvent(event);
  };

  const streamedChunks: string[] = [];
  let chunkIndex = 0;
  let firstTokenSent = false;
  let usageFromStream: any;
  let finishReason: string | null | undefined;
  let modelFromStream: string | null | undefined;
  let streamFailure: Error | null = null;

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

            const metaPayload = buildStreamingMetaPayload(payload, normalized.cleaned);
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
        streamedChunks.push(content);
        if (!firstTokenSent) {
          firstTokenSent = true;
          await emitStream({ type: "control", name: "first_token" });
        }
        const currentIndex = chunkIndex;
        chunkIndex += 1;
        await emitStream({ type: "chunk", content, index: currentIndex });
      },
      async onControl(event) {
        if (event.type === "reconnect") {
          await emitStream({ type: "control", name: "reconnect", attempt: event.attempt });
          return;
        }
        if (event.type === "done") {
          usageFromStream = event.usage ?? usageFromStream;
          finishReason = event.finishReason ?? finishReason;
          modelFromStream = event.model ?? modelFromStream;
        }
      },
      async onError(error) {
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

  try {
    await streamPromise;
  } finally {
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
  const finalize = () => {
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
          isGuest,
          guestId,
        });
      })();
    }
    return finalizePromise;
  };

  const doneSnapshot = { ...timings };
  await emitStream({
    type: "control",
    name: "done",
    meta: {
      finishReason,
      usage: usageFromStream,
      modelo: modelFromStream ?? principalModel,
      length: raw.length,
    },
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
