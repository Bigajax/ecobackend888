import type { Request, Response } from "express";

import type { ActivationTracer } from "../../core/activationTracer";
import type {
  EcoLatencyMarks,
  EcoStreamHandler,
} from "../../services/ConversationOrchestrator";
import { log } from "../../services/promptContext/logger";
import { now, smartJoin } from "../../utils";
export const HEARTBEAT_INTERVAL_MS = 25_000;
export const STREAM_TIMEOUT_GUARD_MS = 5_000;
export const STREAM_TIMEOUT_MESSAGE =
  "Desculpe, não consegui enviar uma resposta a tempo. Pode tentar novamente em instantes?";

export type LatencyStage = "prompt_ready" | "ttfb" | "ttlc";

export type StreamSessionOptions = {
  req: Request;
  res: Response;
  respondAsStream: boolean;
  activationTracer: ActivationTracer;
  startTime: number;
  debugRequested: boolean;
};

type StreamEvent =
  | { type: "message"; index: number; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

type StreamEndReason = "done" | "timeout" | "abort" | "error";

export class StreamSession {
  readonly respondAsStream: boolean;
  readonly offlineEvents: StreamEvent[] = [];
  aggregatedText = "";
  chunkReceived = false;
  lastChunkIndex = -1;
  latestTimings: EcoLatencyMarks | undefined;
  cacheCandidateMeta: Record<string, any> | null = null;
  cacheCandidateTimings: EcoLatencyMarks | undefined;
  cacheable = true;
  clientDisconnected = false;
  doneNotified = false;

  private readonly req: Request;
  private readonly res: Response & { flush?: () => void; flushHeaders?: () => void };
  private readonly activationTracer: ActivationTracer;
  private readonly startTime: number;

  private sseStarted = false;
  private streamClosed = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private timeoutGuard: NodeJS.Timeout | null = null;
  private timeoutGuardHandler: (() => void) | null = null;
  private firstChunkLogged = false;
  private nextEventId = 0;
  private endReason: StreamEndReason | null = null;
  private sseLoggedStart = false;

  constructor(options: StreamSessionOptions) {
    this.req = options.req;
    this.res = options.res as Response & { flush?: () => void; flushHeaders?: () => void };
    this.respondAsStream = options.respondAsStream;
    this.activationTracer = options.activationTracer;
    this.startTime = options.startTime;

    this.req.on("close", () => {
      if (!this.streamClosed) {
        this.clientDisconnected = true;
        this.endReason = this.endReason ?? "abort";
        this.logSseLifecycle("abort", { reason: "client_closed" });
      }
      this.streamClosed = true;
      this.stopHeartbeat();
      this.clearTimeoutGuard();
    });
  }

  isClosed() {
    return this.streamClosed;
  }

  initialize(promptReadyImmediate: boolean) {
    this.setTimeoutGuardHandler(() => this.triggerTimeoutFallback());
    if (this.respondAsStream) {
      this.startSse();
    }
    if (promptReadyImmediate) {
      const at = now();
      this.emitLatency("prompt_ready", at);
    }
  }

  dispatchEvent(event: StreamEvent, logExtras: Record<string, unknown> = {}) {
    if (this.streamClosed) return;

    if (!this.respondAsStream) {
      this.offlineEvents.push(event);
      this.logSseEvent(event, null, logExtras);
      return;
    }

    this.startSse();
    const eventId = this.writeSseEvent(event);
    this.logSseEvent(event, eventId, logExtras);
  }

  private getLogContext(): Record<string, unknown> {
    const headerGuest = this.req.get("X-Eco-Guest-Id")?.trim();
    const requestGuest = typeof this.req.guestId === "string" ? this.req.guestId.trim() : undefined;
    const sessionGuest =
      typeof (this.req as any)?.guest?.id === "string" ? ((this.req as any).guest.id as string) : undefined;
    const guestId = requestGuest || headerGuest || sessionGuest || null;
    const streamIdHeader = this.req.get("X-Stream-Id")?.trim();

    return {
      guestId,
      streamId: streamIdHeader || null,
      path: this.req.originalUrl,
    };
  }

  private logSseLifecycle(
    stage: "start" | "chunk" | "done" | "error" | "abort",
    details: Record<string, unknown> = {}
  ) {
    const payload = { ...this.getLogContext(), ...details };
    if (stage === "start") {
      log.info("[ask-eco] sse_start", payload);
    } else if (stage === "chunk") {
      log.info("[ask-eco] sse_chunk", payload);
    } else if (stage === "done") {
      log.info("[ask-eco] sse_done", payload);
    } else if (stage === "error") {
      log.error("[ask-eco] sse_error", payload);
    } else if (stage === "abort") {
      log.warn("[ask-eco] sse_abort", payload);
    }
  }

  private logSseEvent(event: StreamEvent, eventId: number | null, extras: Record<string, unknown>) {
    const base = eventId != null ? { eventId } : {};
    if (event.type === "message") {
      this.logSseLifecycle("chunk", { ...base, ...extras, index: event.index });
    } else if (event.type === "done") {
      this.logSseLifecycle("done", { ...base, ...extras });
    } else if (event.type === "error") {
      this.logSseLifecycle("error", { ...base, ...extras, message: event.message });
    }
  }

  private writeSseEvent(event: StreamEvent): number {
    const eventId = this.nextEventId++;
    const name = event.type === "message" ? "message" : event.type;
    const data =
      event.type === "message"
        ? { index: event.index, text: event.text }
        : event.type === "done"
        ? { done: true }
        : { error: event.message };
    const payload = `id: ${eventId}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    this.res.write(payload);
    this.res.flush?.();
    (this.res as any).__sseNextId = this.nextEventId;
    return eventId;
  }

  emitLatency(stage: LatencyStage, at: number, timings?: EcoLatencyMarks) {
    if (stage === "prompt_ready") this.activationTracer.markPromptReady(at);
    else if (stage === "ttfb") this.activationTracer.markFirstToken(at);
    else if (stage === "ttlc") this.activationTracer.markTotal(at);
    const sinceStartMs = at - this.startTime;
    log.info(`// LATENCY: ${stage}`, { at, sinceStartMs, timings });
  }

  triggerTimeoutFallback() {
    if (!this.respondAsStream || this.streamClosed || this.chunkReceived) return;
    this.cacheable = false;
    this.handleChunk(STREAM_TIMEOUT_MESSAGE);
    const at = now();
    this.emitLatency("ttlc", at, this.latestTimings);
    this.dispatchEvent({ type: "done" }, { reason: "timeout" });
    this.end("timeout");
  }

  sendErrorAndEnd(message: string) {
    this.activationTracer.addError("stream", message);
    const at = now();
    this.emitLatency("ttlc", at, this.latestTimings);
    this.dispatchEvent({ type: "error", message }, { reason: "error" });
    this.clearTimeoutGuard();
    this.end("error");
  }

  clearTimeoutGuard() {
    if (this.timeoutGuard) {
      clearTimeout(this.timeoutGuard);
      this.timeoutGuard = null;
    }
  }

  end(reason: StreamEndReason = "done") {
    if (this.streamClosed) {
      this.endReason = this.endReason ?? reason;
      return;
    }
    this.streamClosed = true;
    this.endReason = reason;
    this.stopHeartbeat();
    this.clearTimeoutGuard();
    if (this.respondAsStream) {
      try {
        this.res.flush?.();
      } catch {
        // ignore failures flushing the closing frame
      }
      this.res.end();
    }
  }

  markLatestTimings(timings?: EcoLatencyMarks) {
    this.latestTimings = timings ?? this.latestTimings;
  }

  createStreamHandler(): EcoStreamHandler {
    return {
      onEvent: async (event) => {
        if (event.type === "first_token") {
          if (typeof event.delta === "string" && event.delta) {
            this.handleChunk(event.delta);
          }
          return;
        }
        if (event.type === "chunk") {
          const delta =
            typeof event.delta === "string" && event.delta
              ? event.delta
              : typeof event.content === "string"
              ? event.content
              : "";
          if (delta) {
            this.handleChunk(delta, event.index);
          }
          return;
        }
        if (event.type === "error") {
          this.cacheable = false;
          this.sendErrorAndEnd(event.error.message);
          return;
        }
        if (event.type === "control") {
          this.handleControlEvent(event);
        }
      },
    };
  }

  private handleControlEvent(event: any) {
    if (event.name === "prompt_ready") {
      this.markLatestTimings(event.timings);
      const at = now();
      this.emitLatency("prompt_ready", at, this.latestTimings);
      return;
    }
    if (event.name === "first_token") {
      return;
    }
    if (event.name === "meta") {
      return;
    }
    if (event.name === "memory_saved") {
      return;
    }
    if (event.name === "done") {
      this.doneNotified = true;
      this.cacheCandidateMeta = event.meta ?? null;
      this.cacheCandidateTimings = event.timings ?? this.latestTimings;
      this.markLatestTimings(event.timings);
      if (!this.chunkReceived && this.respondAsStream) {
        this.triggerTimeoutFallback();
        return;
      }
      const at = now();
      this.emitLatency("ttlc", at, this.latestTimings);
      this.dispatchEvent({ type: "done" });
      this.clearTimeoutGuard();
      this.end("done");
    }
  }

  private handleChunk(content: string, index?: number) {
    if (typeof content !== "string") return;
    if (content.length === 0) return;
    const resolvedIndex = this.lastChunkIndex + 1;
    const hasExplicitIndex = typeof index === "number" && Number.isFinite(index);
    if (hasExplicitIndex && index !== resolvedIndex) {
      log.warn("[ask-eco] chunk_index_out_of_order", {
        expected: resolvedIndex,
        received: index,
      });
    }

    if (!this.firstChunkLogged) {
      this.firstChunkLogged = true;
      const at = now();
      this.emitLatency("ttfb", at, this.latestTimings);
    }
    this.aggregatedText = smartJoin(this.aggregatedText, content);
    this.chunkReceived = true;
    this.lastChunkIndex = resolvedIndex;
    this.clearTimeoutGuard();
    this.dispatchEvent({ type: "message", index: resolvedIndex, text: content });
  }

  private startSse() {
    if (!this.respondAsStream || this.sseStarted) return;
    this.sseStarted = true;
    this.res.status(200);
    this.res.setHeader("Content-Type", "text/event-stream");
    this.res.setHeader("Cache-Control", "no-cache");
    this.res.setHeader("Connection", "keep-alive");
    this.res.setHeader("X-Accel-Buffering", "no");
    this.res.flushHeaders?.();
    this.res.flush?.();
    if (!this.sseLoggedStart) {
      this.sseLoggedStart = true;
      this.logSseLifecycle("start");
    }
    this.ensureHeartbeat();
    this.ensureTimeoutGuard();
  }

  private ensureHeartbeat() {
    if (!this.respondAsStream || this.heartbeatTimer || this.streamClosed) return;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private sendHeartbeat() {
    if (!this.respondAsStream || this.streamClosed || !this.sseStarted) return;
    this.res.write(`:\n\n`);
    this.res.flush?.();
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private ensureTimeoutGuard() {
    if (!this.respondAsStream || this.timeoutGuard || this.streamClosed) return;
    this.timeoutGuard = setTimeout(() => {
      if (this.streamClosed || this.chunkReceived) return;
      this.timeoutGuardHandler?.();
    }, STREAM_TIMEOUT_GUARD_MS);
  }

  private setTimeoutGuardHandler(handler: () => void) {
    this.timeoutGuardHandler = handler;
    this.ensureTimeoutGuard();
  }
}
