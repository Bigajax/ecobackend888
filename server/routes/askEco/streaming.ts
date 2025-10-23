import type { Request, Response } from "express";

import type { ActivationTracer } from "../../core/activationTracer";
import type {
  EcoLatencyMarks,
  EcoStreamHandler,
} from "../../services/ConversationOrchestrator";
import { log } from "../../services/promptContext/logger";
import { now } from "../../utils";
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

export class StreamSession {
  readonly respondAsStream: boolean;
  readonly offlineEvents: Array<Record<string, unknown>> = [];
  aggregatedText = "";
  chunkReceived = false;
  lastChunkIndex = -1;
  latestTimings: EcoLatencyMarks | undefined;
  cacheCandidateMeta: Record<string, any> | null = null;
  cacheCandidateTimings: EcoLatencyMarks | undefined;
  cacheable = true;
  clientDisconnected = false;
  doneNotified = false;
  private firstTokenDispatched = false;
  private latencyEvents: Array<{
    type: "latency";
    stage: LatencyStage;
    at: number;
    sinceStartMs: number;
    timings?: EcoLatencyMarks;
  }> = [];
  private metaDispatched = false;

  private readonly req: Request;
  private readonly res: Response & { flush?: () => void; flushHeaders?: () => void };
  private readonly activationTracer: ActivationTracer;
  private readonly startTime: number;
  private readonly debugRequested: boolean;

  private sseStarted = false;
  private streamClosed = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private timeoutGuard: NodeJS.Timeout | null = null;
  private timeoutGuardHandler: (() => void) | null = null;
  private firstChunkLogged = false;

  constructor(options: StreamSessionOptions) {
    this.req = options.req;
    this.res = options.res as Response & { flush?: () => void; flushHeaders?: () => void };
    this.respondAsStream = options.respondAsStream;
    this.activationTracer = options.activationTracer;
    this.startTime = options.startTime;
    this.debugRequested = options.debugRequested;

    this.req.on("close", () => {
      if (!this.streamClosed) {
        this.clientDisconnected = true;
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
    this.latencyEvents = [];
    this.metaDispatched = false;
    this.firstTokenDispatched = false;
    this.setTimeoutGuardHandler(() => this.triggerTimeoutFallback());
    if (this.respondAsStream) {
      this.startSse();
    }
    if (promptReadyImmediate) {
      const at = now();
      this.dispatchEvent({ type: "prompt_ready", at, sinceStartMs: at - this.startTime });
      this.emitLatency("prompt_ready", at);
    }
  }

  private send(payload: Record<string, unknown>) {
    if (this.streamClosed) return;
    const type = (payload as any)?.type;
    if (type === "meta" || type === "memory_saved") {
      this.metaDispatched = true;
    }
    if (!this.respondAsStream) {
      this.offlineEvents.push(payload);
      return;
    }
    this.startSse();
    this.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    this.res.flush?.();
  }

  private flushLatencyEvents() {
    if (this.latencyEvents.length === 0) return;
    const events = this.latencyEvents.slice();
    this.latencyEvents = [];
    for (const entry of events) {
      this.send(entry);
    }
  }

  private emitMetaFromDone(meta: Record<string, unknown> | null | undefined) {
    if (this.metaDispatched) return;
    if (meta && typeof meta === "object") {
      let cloned: Record<string, unknown>;
      try {
        cloned = JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
      } catch {
        cloned = { ...meta };
      }
      this.metaDispatched = true;
      this.send({ type: "meta", data: cloned });
      const memorySaved = (meta as any)?.memory_saved;
      if (typeof memorySaved === "boolean") {
        this.send({ type: "memory_saved", saved: memorySaved, meta: cloned });
      }
    } else {
      this.metaDispatched = true;
    }
  }

  dispatchEvent(payload: Record<string, unknown>) {
    if (this.streamClosed) return;
    if ((payload as any)?.type === "first_token") {
      if (this.firstTokenDispatched) return;
      this.firstTokenDispatched = true;
    }
    if ((payload as any)?.type === "done") {
      const metaPayload =
        (payload as any).meta && typeof (payload as any).meta === "object"
          ? ((payload as any).meta as Record<string, unknown>)
          : undefined;
      this.emitMetaFromDone(metaPayload);
      this.flushLatencyEvents();
      if (typeof (payload as any).content !== "string") {
        (payload as any).content = this.aggregatedText;
      }
    }
    this.send(payload);
  }

  emitLatency(stage: LatencyStage, at: number, timings?: EcoLatencyMarks) {
    if (stage === "prompt_ready") this.activationTracer.markPromptReady(at);
    else if (stage === "ttfb") this.activationTracer.markFirstToken(at);
    else if (stage === "ttlc") this.activationTracer.markTotal(at);
    const sinceStartMs = at - this.startTime;
    log.info(`// LATENCY: ${stage}`, { at, sinceStartMs, timings });
    this.latencyEvents.push({ type: "latency", stage, at, sinceStartMs, timings });
  }

  triggerTimeoutFallback() {
    if (!this.respondAsStream || this.streamClosed || this.chunkReceived) return;
    this.cacheable = false;
    this.chunkReceived = true;
    this.aggregatedText = STREAM_TIMEOUT_MESSAGE;
    this.lastChunkIndex = this.lastChunkIndex < 0 ? 0 : this.lastChunkIndex + 1;
    this.dispatchEvent({
      type: "chunk",
      delta: STREAM_TIMEOUT_MESSAGE,
      index: this.lastChunkIndex,
      fallback: true,
    });
    const at = now();
    this.emitLatency("ttlc", at, this.latestTimings);
    const donePayload: Record<string, unknown> = {
      type: "done",
      meta: { fallback: true, reason: "timeout" },
      at,
      sinceStartMs: at - this.startTime,
      timings: this.latestTimings,
    };
    if (this.debugRequested) {
      donePayload.trace = this.activationTracer.snapshot();
    }
    this.dispatchEvent(donePayload);
    this.end();
  }

  sendErrorAndEnd(message: string) {
    if (!this.aggregatedText) {
      this.aggregatedText = message;
    }
    this.activationTracer.addError("stream", message);
    this.dispatchEvent({ type: "error", message });
    const at = now();
    this.emitLatency("ttlc", at, this.latestTimings);
    const donePayload: Record<string, unknown> = {
      type: "done",
      meta: { fallback: true, reason: "error" },
      at,
      sinceStartMs: at - this.startTime,
      timings: this.latestTimings,
    };
    if (this.debugRequested) {
      donePayload.trace = this.activationTracer.snapshot();
    }
    this.dispatchEvent(donePayload);
    this.clearTimeoutGuard();
    this.end();
  }

  clearTimeoutGuard() {
    if (this.timeoutGuard) {
      clearTimeout(this.timeoutGuard);
      this.timeoutGuard = null;
    }
  }

  end() {
    if (this.streamClosed) return;
    this.streamClosed = true;
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
          this.dispatchEvent({ type: "first_token" });
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
      this.dispatchEvent({
        type: "prompt_ready",
        at,
        sinceStartMs: at - this.startTime,
        timings: this.latestTimings,
      });
      this.emitLatency("prompt_ready", at, this.latestTimings);
      return;
    }
    if (event.name === "first_token") {
      this.dispatchEvent({ type: "first_token" });
      return;
    }
    if (event.name === "meta") {
      const metaPayload =
        event.meta && typeof event.meta === "object" ? (event.meta as Record<string, unknown>) : {};
      this.send({ type: "meta", data: metaPayload });
      return;
    }
    if (event.name === "memory_saved") {
      const metaPayload =
        event.meta && typeof event.meta === "object" ? (event.meta as Record<string, unknown>) : undefined;
      this.send({ type: "memory_saved", saved: true, meta: metaPayload });
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
      const donePayload: Record<string, unknown> = {
        type: "done",
        meta: event.meta ?? {},
        at,
        sinceStartMs: at - this.startTime,
        timings: this.latestTimings,
      };
      if (this.debugRequested) {
        donePayload.trace = this.activationTracer.snapshot();
      }
      this.dispatchEvent(donePayload);
      this.clearTimeoutGuard();
      this.end();
    }
  }

  private handleChunk(content: string, index?: number) {
    if (!content) return;
    const expectedIndex = this.lastChunkIndex + 1;
    const hasExplicitIndex = typeof index === "number" && Number.isFinite(index);
    const resolvedIndex = hasExplicitIndex ? (index as number) : expectedIndex;

    if (hasExplicitIndex && resolvedIndex !== expectedIndex) {
      log.warn("[ask-eco] chunk_index_out_of_order", {
        expected: expectedIndex,
        received: resolvedIndex,
        clientIndex: index,
      });
      return;
    }

    if (!this.firstChunkLogged) {
      this.firstChunkLogged = true;
      const at = now();
      this.emitLatency("ttfb", at, this.latestTimings);
    }
    this.aggregatedText += content;
    this.chunkReceived = true;
    this.lastChunkIndex = resolvedIndex;
    this.clearTimeoutGuard();
    this.dispatchEvent({ type: "chunk", delta: content, index: resolvedIndex });
  }

  private startSse() {
    if (!this.respondAsStream || this.sseStarted) return;
    this.sseStarted = true;
    this.res.status(200);
    this.res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    this.res.setHeader("Cache-Control", "no-cache, no-transform");
    this.res.setHeader("Connection", "keep-alive");
    this.res.flushHeaders?.();
    this.res.flush?.();
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
