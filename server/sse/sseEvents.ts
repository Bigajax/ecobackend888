import { log } from "../services/promptContext/logger";
import type { EcoStreamEvent } from "../services/conversation/types";
import { extractEventText, sanitizeOutput } from "../utils/textExtractor";
import type { SSEConnection } from "../utils/sse";
import { SseStreamState } from "./sseState";

type TelemetryFn = (
  signal: string,
  value?: number,
  meta?: Record<string, unknown>
) => void;

type BuildDonePayload = (
  options: {
    content?: string | null;
    interactionId?: string | null;
    tokens?: { in?: number | null; out?: number | null } | null;
    meta?: Record<string, unknown> | null | undefined;
    timings?: Record<string, unknown> | null | undefined;
    firstTokenLatency?: number | null;
    totalLatency?: number | null;
    timestamp?: number;
  }
) => Record<string, unknown>;

interface SseEventHandlerOptions {
  origin?: string | null;
  clientMessageId?: string | null;
  streamId?: string | null;
  onTelemetry: TelemetryFn;
  guardFallbackText: string;
  idleTimeoutMs: number;
  getDoneSent: () => boolean;
  setDoneSent: (value: boolean) => void;
  clearHeartbeat: () => void;
  clearEarlyClientAbortTimer: () => void;
  getIsClosed: () => boolean;
  clearFirstTokenWatchdog: () => void;
  recordFirstTokenTelemetry: (chunkBytes: number) => void;
  updateUsageTokens: (meta: any) => void;
  mergeLatencyMarks: (marks?: Record<string, unknown>) => void;
  buildDonePayload: BuildDonePayload;
  finalizeClientMessageReservation: (finishReason?: string | null) => void;
  getResolvedInteractionId: () => string | null | undefined;
  isInteractionIdReady: () => boolean;
  captureInteractionId: (value: unknown) => void;
  getInteractionBootstrapPromise: () => Promise<void>;
  sendLatency: (payload: Record<string, unknown>) => void;
  consoleStreamEnd: (payload?: Record<string, unknown>) => void;
  compactMeta: (meta: Record<string, unknown>) => Record<string, unknown>;
  abortSignal: AbortSignal;
  clearAbortListener: () => void;
  releaseActiveStream: () => void;
  onStreamEnd: () => void;
  getSseConnection?: () => SSEConnection | null;
  armFirstTokenWatchdog: () => void;
  streamHasChunkHandler: boolean;
  getRequestAborted?: () => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function resolveSseConnection(
  fallback: SSEConnection,
  resolver?: () => SSEConnection | null
): SSEConnection | null {
  if (typeof resolver === "function") {
    const resolved = resolver();
    if (resolved) {
      return resolved;
    }
  }
  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function compactBody(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.length > 2000 ? `${trimmed.slice(0, 1997)}...` : trimmed;
  }
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return null;
    }
    return serialized.length > 2000 ? `${serialized.slice(0, 1997)}...` : serialized;
  } catch {
    try {
      const coerced = String(value);
      const trimmed = coerced.trim();
      if (!trimmed) {
        return null;
      }
      return trimmed.length > 2000 ? `${trimmed.slice(0, 1997)}...` : trimmed;
    } catch {
      return null;
    }
  }
}

export class SseEventHandlers {
  private providerOpenedLogged = false;
  private hasEmittedChunk = false;
  private lastDoneEvent: Record<string, unknown> | null = null;

  constructor(
    private readonly state: SseStreamState,
    private readonly sse: SSEConnection,
    private readonly options: SseEventHandlerOptions
  ) {}

  private getStreamId(): string | null {
    const raw = this.options.streamId;
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
    return null;
  }

  private sendEvent(
    event: string,
    payload: Record<string, unknown>,
    resolver?: () => SSEConnection | null
  ) {
    if (this.state.clientClosed) {
      return;
    }
    const connection = resolveSseConnection(this.sse, resolver ?? this.options.getSseConnection);
    if (!connection) {
      return;
    }
    const streamId = this.getStreamId();
    const envelope: Record<string, unknown> = {
      type: event,
      streamId,
      ...payload,
    };
    connection.send(event, envelope);
  }

  private emitDoneEvent(options: {
    finalMeta: Record<string, unknown>;
    donePayload: Record<string, unknown>;
    timings?: Record<string, unknown> | null;
  }) {
    const { finalMeta, donePayload, timings } = options;
    const aggregated = this.state.getAggregatedContent();
    const summaryText =
      typeof (donePayload as any)?.content === "string"
        ? ((donePayload as any).content as string)
        : aggregated;
    const streamId = this.getStreamId();
    const response = {
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: summaryText,
            },
          ],
        },
      ],
    };

    const envelope: Record<string, unknown> = {
      done: true,
      meta: finalMeta,
      response,
      payload: donePayload,
      index: this.state.chunksCount,
    };

    const sinceStart = (donePayload as any)?.sinceStartMs;
    if (typeof sinceStart === "number" && Number.isFinite(sinceStart)) {
      envelope.sinceStartMs = sinceStart;
    }
    const atValue = (donePayload as any)?.at;
    if (typeof atValue === "string") {
      envelope.at = atValue;
    }
    if (timings && Object.keys(timings).length) {
      envelope.timings = timings;
    }

    this.sendEvent("done", envelope);
    log.info("[ask-eco] stream_done_event", {
      origin: this.options.origin ?? null,
      clientMessageId: this.options.clientMessageId ?? null,
      streamId,
      response,
    });
  }

  private resolveClientFinishReason(original?: string | null): string {
    if (this.options.getRequestAborted?.()) {
      return "client_disconnect";
    }
    if (!this.hasEmittedChunk) {
      return "no_content";
    }
    const normalized = typeof original === "string" ? original.trim() : "";
    if (normalized && !["done", "stream_done", "completed", "stop"].includes(normalized)) {
      return normalized;
    }
    return "completed";
  }

  private buildNoChunkErrorPayload(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      code: "no_chunks_emitted",
      finishReason: this.resolveClientFinishReason(),
    };

    const doneEvent = this.lastDoneEvent;
    const streamResult = isRecord(this.state.streamResult) ? this.state.streamResult : null;

    const statusCandidates: unknown[] = [
      doneEvent ? (doneEvent as any).providerStatus : undefined,
      doneEvent ? (doneEvent as any).status : undefined,
      doneEvent && isRecord((doneEvent as any).meta)
        ? ((doneEvent as any).meta as Record<string, unknown>).status
        : undefined,
      streamResult ? (streamResult as Record<string, unknown>).providerStatus : undefined,
      streamResult ? (streamResult as Record<string, unknown>).status : undefined,
    ];

    for (const candidate of statusCandidates) {
      const resolved = toNullableNumber(candidate);
      if (resolved != null) {
        base.providerStatus = resolved;
        break;
      }
    }

    const bodyCandidates: unknown[] = [
      doneEvent ? (doneEvent as any).providerBody : undefined,
      doneEvent ? (doneEvent as any).body : undefined,
      doneEvent ? (doneEvent as any).raw : undefined,
      doneEvent && isRecord((doneEvent as any).meta)
        ? ((doneEvent as any).meta as Record<string, unknown>).providerBody
        : undefined,
      doneEvent && isRecord((doneEvent as any).meta)
        ? ((doneEvent as any).meta as Record<string, unknown>).body
        : undefined,
      streamResult ? (streamResult as Record<string, unknown>).providerBody : undefined,
      streamResult ? (streamResult as Record<string, unknown>).body : undefined,
      streamResult ? (streamResult as Record<string, unknown>).raw : undefined,
    ];

    for (const candidate of bodyCandidates) {
      const compacted = compactBody(candidate);
      if (compacted) {
        base.providerBody = compacted;
        break;
      }
    }

    const timingFromEvent = doneEvent && isRecord((doneEvent as any).timings)
      ? ((doneEvent as any).timings as Record<string, unknown>)
      : null;
    const timingSource = timingFromEvent ||
      (Object.keys(this.state.latencyMarks).length ? this.state.latencyMarks : null);

    if (timingSource && Object.keys(timingSource).length) {
      base.timings = timingSource;
    }

    return this.options.compactMeta(base);
  }

  sendMeta(obj: Record<string, unknown>) {
    if (!obj) {
      return;
    }
    this.state.mergeMetaPayload(obj);
    this.sendEvent("meta", { data: { ...obj } });
  }

  sendMemorySaved(obj: Record<string, unknown>) {
    if (!obj) {
      return;
    }
    this.state.addMemoryEvent(obj);
    this.sendEvent("memory_saved", { saved: true, meta: { ...obj } });
  }

  sendErrorEvent(payload: Record<string, unknown>) {
    const message =
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : undefined;
    const reason =
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : typeof payload.code === "string" && payload.code.trim()
        ? payload.code.trim()
        : message ?? "unknown_error";
    const envelope = {
      ...payload,
      reason,
    };
    this.sendEvent("error", envelope);
    this.state.errorEmitted = true;
    log.error("[ask-eco] sse_error", envelope);
  }

  ensureGuardFallback(reason: string) {
    if (
      !this.state.sawChunk ||
      this.state.guardFallbackSent ||
      this.state.clientClosed
    ) {
      return;
    }
    const normalizedReason = typeof reason === "string" ? reason.trim().toLowerCase() : "";
    const finishReasonNormalized =
      typeof this.state.finishReason === "string"
        ? this.state.finishReason.trim().toLowerCase()
        : normalizedReason;
    if (
      this.state.sawChunk &&
      (normalizedReason === "stop" || finishReasonNormalized === "stop")
    ) {
      this.state.guardFallbackSent = false;
      this.state.guardFallbackReason = null;
      return;
    }
    this.state.markGuardFallback(reason);
    const connection = resolveSseConnection(this.sse, this.options.getSseConnection);
    const canEmitGuard =
      Boolean(connection) && !this.options.getIsClosed() && !this.state.clientClosed;
    const interactionId = this.options.getResolvedInteractionId?.() ?? null;
    log.warn("[ask-eco] guard_fallback_emit", {
      origin: this.options.origin ?? null,
      clientMessageId: this.options.clientMessageId ?? null,
      interactionId,
      reason,
      emitted: canEmitGuard,
    });
    if (!canEmitGuard || !connection) {
      return;
    }
    this.sendChunk({ text: this.options.guardFallbackText, index: 0 });
    if (this.state.clientClosed) {
      return;
    }
    if (!this.options.getDoneSent()) {
      const usageMeta = {
        input_tokens: this.state.usageTokens.in,
        output_tokens: this.state.usageTokens.out,
      };
      const finalMeta = {
        ...this.state.doneMeta,
        finishReason: reason || this.state.finishReason || "guard_fallback",
        usage: usageMeta,
      };
      const summaryText = this.state.getAggregatedContent();
      const donePayload = this.options.buildDonePayload({
        content: summaryText.length ? summaryText : null,
        interactionId: this.options.getResolvedInteractionId?.() ?? null,
        tokens: this.state.usageTokens,
        meta: finalMeta,
        timings: Object.keys(this.state.latencyMarks).length
          ? this.state.latencyMarks
          : null,
        totalLatency: this.state.doneAt ? this.state.doneAt - this.state.t0 : null,
      });
      this.state.setDoneMeta(finalMeta);
      this.state.ensureFinishReason(finalMeta.finishReason as string);
      this.options.setDoneSent(true);
      this.emitDoneEvent({
        finalMeta,
        donePayload,
        timings: Object.keys(this.state.latencyMarks).length
          ? this.state.latencyMarks
          : null,
      });
    }
  }

  sendDone(reason?: string | null) {
    if (this.state.done) return;
    this.options.clearFirstTokenWatchdog();
    const nowTs = Date.now();
    this.state.markDone(nowTs);
    this.options.clearEarlyClientAbortTimer();
    this.options.clearHeartbeat();
    let finishReason = reason ?? this.state.finishReason;
    if (!finishReason && this.state.firstTokenWatchdogFired) {
      finishReason = "first_token_timeout";
    }
    this.state.setFinishReason(finishReason ?? "unknown");

    const clientClosed = this.state.clientClosed;

    if (!clientClosed) {
      this.ensureGuardFallback(this.state.finishReason || "unknown");
    }

    if (!this.state.sawChunk && !clientClosed) {
      if (!this.state.errorEmitted) {
        this.sendErrorEvent({
          code: "NO_CHUNKS_EMITTED",
          message: "Nenhum chunk emitido antes do encerramento",
          finishReason: finishReason ?? this.state.finishReason ?? "unknown",
        });
      }
      const interactionId = this.options.getResolvedInteractionId?.() ?? null;
      log.error("[ask-eco] guard_fallback_missing_chunk", {
        origin: this.options.origin ?? null,
        clientMessageId: this.options.clientMessageId ?? null,
        interactionId,
        finishReason: this.state.finishReason,
        streamId: this.getStreamId(),
      });
    }

    const finalizeStream = async () => {
      try {
        const bootstrapPromise = this.options.getInteractionBootstrapPromise();
        if (bootstrapPromise) {
          await bootstrapPromise.catch(() => undefined);
        }
      } finally {
        if (!this.options.isInteractionIdReady()) {
          this.options.captureInteractionId(this.options.getResolvedInteractionId?.());
        }
      }

      const firstTokenLatency = this.state.firstTokenAt ? this.state.firstTokenAt - this.state.t0 : null;
      const finishedAt = this.state.doneAt || Date.now();
      const totalLatency = finishedAt - this.state.t0;
      const sincePromptReady =
        this.state.promptReadyAt > 0 ? finishedAt - this.state.promptReadyAt : null;
      const beforeDone =
        this.state.connectionClosed && this.state.closeAt > 0 && this.state.closeAt < this.state.doneAt;
      const closeDelayMs =
        this.state.closeAt > 0 ? Math.max(0, this.state.doneAt - this.state.closeAt) : null;
      const closeSinceStartMs =
        this.state.closeAt > 0 ? Math.max(0, this.state.closeAt - this.state.t0) : null;
      const streamId = this.getStreamId();

      try {
        this.sendMeta({
          type: "llm_status",
          firstTokenLatencyMs: firstTokenLatency,
          chunks: this.state.chunksCount,
          bytes: this.state.bytesCount,
        });

        const resolvedFinishReason = this.state.finishReason || "unknown";
        const clientFinishReason = this.resolveClientFinishReason(resolvedFinishReason);

        log.info("[ask-eco] stream_done", {
          finishReason: resolvedFinishReason,
          sawChunk: this.state.sawChunk,
          chunks: this.state.chunksCount,
          bytes: this.state.bytesCount,
          totalBytes: this.state.bytesCount,
          guardFallback: this.state.guardFallbackSent,
          origin: this.options.origin ?? null,
          clientMessageId: this.options.clientMessageId ?? null,
          firstTokenLatencyMs: firstTokenLatency,
          totalLatencyMs: totalLatency,
          sincePromptReadyMs: sincePromptReady,
          clientFinishReason,
          streamId,
        });

        const streamMeta = isRecord(this.state.streamResult) ? this.state.streamResult : null;

        this.options.updateUsageTokens(streamMeta);
        this.options.updateUsageTokens(streamMeta?.meta);
        this.options.mergeLatencyMarks(streamMeta?.timings as Record<string, unknown> | undefined);

        const aggregatedMeta = (() => {
          const combined: Record<string, unknown> = { ...this.state.metaPayload };
          if (streamMeta?.meta && isRecord(streamMeta.meta)) {
            Object.assign(combined, streamMeta.meta as Record<string, unknown>);
          }
          if (this.state.memoryEvents.length) {
            combined.memory_events = this.state.memoryEvents;
          }
          return Object.keys(combined).length ? combined : null;
        })();

        if (streamMeta?.timings && isRecord(streamMeta.timings)) {
          this.options.mergeLatencyMarks(streamMeta.timings as Record<string, unknown>);
        }

        const latencyPayload = this.options.compactMeta({
          first_token_latency_ms: firstTokenLatency ?? undefined,
          total_latency_ms: totalLatency,
          marks: Object.keys(this.state.latencyMarks).length ? this.state.latencyMarks : undefined,
        });

        if (Object.keys(latencyPayload).length) {
          this.options.sendLatency(latencyPayload);
        }

        const summaryText = this.state.getAggregatedContent();
        const streamMetaInteractionId =
          streamMeta?.meta && isRecord(streamMeta.meta)
            ? ((streamMeta.meta as Record<string, unknown>).interaction_id as string | undefined) ?? null
            : null;
        const resolvedInteractionForPayload =
          this.options.getResolvedInteractionId?.() ?? streamMetaInteractionId;

        const donePayload = this.options.buildDonePayload({
          content: summaryText.length ? summaryText : null,
          interactionId: resolvedInteractionForPayload,
          tokens: this.state.usageTokens,
          meta: aggregatedMeta ?? null,
          timings: Object.keys(this.state.latencyMarks).length ? this.state.latencyMarks : null,
          firstTokenLatency,
          totalLatency,
          timestamp: finishedAt,
        });

        const usagePayload = {
          input_tokens: this.state.usageTokens.in,
          output_tokens: this.state.usageTokens.out,
        };

        const baseMeta = Object.keys(this.state.doneMeta).length ? { ...this.state.doneMeta } : {};
        const finalMeta: Record<string, unknown> = {
          ...baseMeta,
          finishReason: clientFinishReason,
          usage: usagePayload,
        };
        if (resolvedFinishReason && resolvedFinishReason !== clientFinishReason) {
          finalMeta.originalFinishReason = resolvedFinishReason;
        }
        this.state.setDoneMeta(finalMeta);

        const connection = resolveSseConnection(this.sse, this.options.getSseConnection);
        if (!clientClosed && connection) {
          if (this.hasEmittedChunk) {
            if (!this.options.getDoneSent()) {
              this.options.setDoneSent(true);
              this.emitDoneEvent({
                finalMeta,
                donePayload,
                timings: Object.keys(this.state.latencyMarks).length
                  ? this.state.latencyMarks
                  : null,
              });
            }
          } else {
            const errorPayload = this.buildNoChunkErrorPayload();
            this.options.setDoneSent(true);
            this.sendEvent("error", {
              message: "no_chunks_emitted",
              details: errorPayload,
            });
            log.warn("[ask-eco] sse_no_chunk_ended", {
              origin: this.options.origin ?? null,
              clientMessageId: this.options.clientMessageId ?? null,
              streamId,
              finishReason: clientFinishReason,
              providerStatus: (errorPayload as { providerStatus?: number }).providerStatus ?? null,
            });
          }
        }

        log.info("[ask-eco] stream_finalize", {
          origin: this.options.origin ?? null,
          interaction_id: this.options.getResolvedInteractionId?.() ?? null,
          clientMessageId: this.options.clientMessageId ?? null,
          stream_aborted: this.options.abortSignal.aborted,
          final_chunk_sent: this.state.sawChunk,
          finishReason: resolvedFinishReason,
          clientFinishReason,
          summary: donePayload,
          guardFallback: this.state.guardFallbackSent,
          streamId,
        });

        this.options.finalizeClientMessageReservation(clientFinishReason);

        log.info("[ask-eco] stream_end", {
          finishReason: resolvedFinishReason,
          clientFinishReason,
          chunks: this.state.chunksCount,
          bytes: this.state.bytesCount,
          totalBytes: this.state.bytesCount,
          guardFallback: this.state.guardFallbackSent,
          clientClosed: this.state.clientClosed,
          clientClosedStack: this.state.clientClosedStack ?? undefined,
          closeClassification: this.state.closeClassification,
          closeSource: this.state.closeSource ?? undefined,
          closeError: this.state.closeErrorMessage ?? undefined,
          origin: this.options.origin ?? null,
          beforeDone,
          sinceStartMs: totalLatency,
          sincePromptReadyMs: sincePromptReady,
          closeSinceStartMs,
          closeDelayMs: closeDelayMs ?? undefined,
          serverAbortReason: this.state.serverAbortReason ?? undefined,
          streamId,
        });

        const endPayload: Record<string, unknown> = {};
        if (resolvedFinishReason) {
          endPayload.finishReason = resolvedFinishReason;
          endPayload.clientFinishReason = clientFinishReason;
        }
        this.options.consoleStreamEnd(Object.keys(endPayload).length ? endPayload : undefined);

        const doneValue = clientFinishReason === "completed" ? 1 : 0;
        this.options.onTelemetry(
          "done",
          doneValue,
          this.options.compactMeta({
            finish_reason: clientFinishReason,
            chunks: this.state.chunksCount,
            bytes: this.state.bytesCount,
            first_token_latency_ms: firstTokenLatency ?? undefined,
            total_latency_ms: totalLatency,
            model: this.state.model ?? undefined,
            saw_chunk: this.state.sawChunk,
          })
        );
      } finally {
        this.options.clearAbortListener();
        this.options.releaseActiveStream();

        this.sse.end();
        this.options.onStreamEnd();
      }
    };

    void finalizeStream();
  }

  handleStreamTimeout() {
    if (this.state.done) {
      return;
    }
    this.options.clearFirstTokenWatchdog();
    this.state.setServerAbortReason("idle_timeout");
    this.state.ensureFinishReason("idle_timeout");
    log.warn("[ask-eco] stream_idle_timeout", {
      timeoutMs: this.options.idleTimeoutMs,
      origin: this.options.origin ?? null,
      clientMessageId: this.options.clientMessageId ?? null,
    });
    this.options.onTelemetry("idle_timeout", 0, {
      timeout_ms: this.options.idleTimeoutMs,
    });
    this.sendDone("idle_timeout");
  }

  sendChunk(input: { text: string; index?: number; meta?: Record<string, unknown> }) {
    if (!input || typeof input.text !== "string") return;
    if (this.state.clientClosed) {
      return;
    }
    const cleaned = sanitizeOutput(input.text);
    const finalText = cleaned;
    if (finalText.length === 0) return;
    if (finalText.trim().toLowerCase() === "ok") {
      return;
    }

    this.options.clearEarlyClientAbortTimer();
    const providedIndex =
      typeof input.index === "number" && Number.isFinite(input.index)
        ? Number(input.index)
        : null;
    const chunkInfo = this.state.recordChunk({ text: finalText, providedIndex });

    const streamId = this.getStreamId();

    if (chunkInfo.firstChunk) {
      this.options.clearFirstTokenWatchdog();
      this.sendMeta({ type: "first_token_latency_ms", value: this.state.firstTokenAt - this.state.t0 });
      this.options.recordFirstTokenTelemetry(chunkInfo.chunkBytes);
      log.info("[ask-eco] sse_first_chunk", {
        origin: this.options.origin ?? null,
        clientMessageId: this.options.clientMessageId ?? null,
        streamId,
        index: chunkInfo.chunkIndex,
        bytes: chunkInfo.chunkBytes,
      });
      log.info("[ask-eco] first_token", {
        origin: this.options.origin ?? null,
        clientMessageId: this.options.clientMessageId ?? null,
        streamId,
        index: chunkInfo.chunkIndex,
      });
    }

    if (input.meta && isRecord(input.meta) && Object.keys(input.meta).length) {
      this.sendMeta(input.meta);
    }

    if (!this.state.clientClosed) {
      this.sendEvent(
        "chunk",
        {
          index: chunkInfo.chunkIndex,
          delta: finalText,
        },
        this.options.getSseConnection
      );
    }

    this.hasEmittedChunk = true;
    this.options.clearFirstTokenWatchdog();

    log.info("[ask-eco] stream_chunk", {
      index: chunkInfo.chunkIndex,
      bytes: chunkInfo.chunkBytes,
      totalBytes: chunkInfo.totalBytes,
      chunks: this.state.chunksCount,
      origin: this.options.origin ?? null,
      streamId,
    });
  }

  forwardEvent(rawEvt: EcoStreamEvent | any) {
    if (this.state.done || this.state.clientClosed) return;
    const evt = rawEvt as any;
    const type = String(evt?.type || "");

    if (!this.providerOpenedLogged) {
      this.providerOpenedLogged = true;
      const controlName = typeof evt?.name === "string" ? evt.name : undefined;
      log.info("[ask-eco] sse_provider_open", {
        origin: this.options.origin ?? null,
        clientMessageId: this.options.clientMessageId ?? null,
        streamId: this.options.streamId ?? null,
        eventType: type || null,
        control: controlName || undefined,
      });
    }

    switch (type) {
      case "control": {
        const name = typeof evt?.name === "string" ? evt.name : "";
        const meta = evt?.meta && isRecord(evt.meta) ? (evt.meta as Record<string, unknown>) : null;
        if (meta) {
          this.options.captureInteractionId((meta as { interaction_id?: unknown }).interaction_id);
          const maybeModel =
            typeof meta.model === "string"
              ? meta.model
              : typeof (meta as any).modelo === "string"
              ? (meta as any).modelo
              : undefined;
          if (maybeModel) this.state.setModel(maybeModel);
          this.options.updateUsageTokens(meta);
        }
        if (evt?.timings && isRecord(evt.timings)) {
          this.options.mergeLatencyMarks(evt.timings as Record<string, unknown>);
        }
        if (name === "prompt_ready") {
          const nowTs = Date.now();
          this.state.markPromptReady(nowTs);
          this.options.onTelemetry("prompt_ready", 1, {
            stream: true,
            origin: this.options.origin ?? null,
          });
          log.info("[ask-eco] prompt_ready", {
            origin: this.options.origin ?? null,
            clientMessageId: this.options.clientMessageId ?? null,
            interactionId: this.options.getResolvedInteractionId?.() ?? null,
            sinceStartMs: nowTs - this.state.t0,
          });
          this.options.armFirstTokenWatchdog();
          const payload: Record<string, unknown> = {
            at: nowTs,
            sinceStartMs: nowTs - this.state.t0,
          };
          if (evt?.timings && isRecord(evt.timings)) {
            payload.timings = evt.timings as Record<string, unknown>;
          }
          if (meta) {
            payload.meta = meta;
          }
          this.sendEvent("prompt_ready", payload);
          return;
        }
        if (name === "guard_fallback_trigger") {
          const nowTs = Date.now();
          this.state.updateLastEvent(nowTs);
          const reasonFromMeta =
            typeof (meta as any)?.reason === "string"
              ? ((meta as any).reason as string)
              : "guard_fallback_trigger";
          this.ensureGuardFallback(reasonFromMeta);
          log.warn("[ask-eco] guard_fallback_trigger", {
            origin: this.options.origin ?? null,
            clientMessageId: this.options.clientMessageId ?? null,
            interactionId: this.options.getResolvedInteractionId?.() ?? null,
            meta: meta ?? null,
            fallbackEmitted: this.state.guardFallbackSent,
          });
          return;
        }
        if (name === "meta" && meta) {
          this.sendMeta(meta);
          return;
        }
        if (name === "memory_saved" && meta) {
          this.sendMemorySaved(meta);
          return;
        }
        if (name === "done") {
          this.lastDoneEvent = evt as Record<string, unknown>;
          this.sendDone(evt?.meta?.finishReason ?? evt?.finishReason ?? "done");
        }
        return;
      }
      case "first_token": {
        if (this.options.streamHasChunkHandler) {
          return;
        }
        const text = extractEventText(evt);
        if (typeof text === "string" && text && this.state.chunksCount === 0) {
          this.sendChunk({ text });
        }
        return;
      }
      case "chunk":
        if (this.options.streamHasChunkHandler) {
          return;
        }
      // fallthrough
      case "delta":
      case "token": {
        const text = extractEventText(evt);
        if (typeof text === "string" && text) {
          this.sendChunk({ text });
        }
        return;
      }
      case "done": {
        const meta = evt?.meta && isRecord(evt.meta) ? (evt.meta as Record<string, unknown>) : null;
        if (meta) {
          this.options.captureInteractionId((meta as { interaction_id?: unknown }).interaction_id);
          const maybeModel =
            typeof meta.model === "string"
              ? meta.model
              : typeof (meta as any).modelo === "string"
              ? (meta as any).modelo
              : undefined;
          if (maybeModel) this.state.setModel(maybeModel);
          this.options.updateUsageTokens(meta);
        }
        if (evt?.timings && isRecord(evt.timings)) {
          this.options.mergeLatencyMarks(evt.timings as Record<string, unknown>);
        }
        this.sendDone(evt?.meta?.finishReason ?? evt?.finishReason ?? "done");
        return;
      }
      case "error": {
        const message =
          typeof evt?.message === "string"
            ? evt.message
            : evt?.error?.message || "Erro desconhecido";
        this.sendErrorEvent({ message });
        this.sendDone("error");
        return;
      }
      default: {
        const text = extractEventText(evt);
        if (typeof text === "string" && text) {
          this.sendChunk({ text });
        }
        return;
      }
    }
  }
}
