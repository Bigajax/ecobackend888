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

type StreamMessage = { index: number; text: string } | { index: number; done: true };

export class StreamSession {
  readonly respondAsStream: boolean;
  readonly offlineEvents: StreamMessage[] = [];
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

  constructor(options: StreamSessionOptions) {
    this.req = options.req;
    this.res = options.res as Response & { flush?: () => void; flushHeaders?: () => void };
    this.respondAsStream = options.respondAsStream;
    this.activationTracer = options.activationTracer;
    this.startTime = options.startTime;

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
    this.setTimeoutGuardHandler(() => this.triggerTimeoutFallback());
    if (this.respondAsStream) {
      this.startSse();
    }
    if (promptReadyImmediate) {
      const at = now();
      this.emitLatency("prompt_ready", at);
    }
  }

  dispatchEvent(payload: StreamMessage) {
    if (this.streamClosed) return;
    if (!this.respondAsStream) {
      this.offlineEvents.push(payload);
      return;
    }
    this.startSse();
    this.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    this.res.flush?.();
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
    const doneIndex = this.lastChunkIndex + 1;
    this.dispatchEvent({ index: doneIndex, done: true });
    this.end();
  }

  sendErrorAndEnd(message: string) {
    this.activationTracer.addError("stream", message);
    if (message) {
      this.handleChunk(message);
    }
    const at = now();
    this.emitLatency("ttlc", at, this.latestTimings);
    const doneIndex = this.lastChunkIndex + 1;
    this.dispatchEvent({ index: doneIndex, done: true });
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
      const doneIndex = this.lastChunkIndex + 1;
      this.dispatchEvent({ index: doneIndex, done: true });
      this.clearTimeoutGuard();
      this.end();
    }
  }

  private handleChunk(content: string, index?: number) {
    if (!content) return;
    const sanitized = this.sanitizeText(content);
    if (!sanitized) return;
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
    this.aggregatedText = smartJoin(this.aggregatedText, sanitized);
    this.chunkReceived = true;
    this.lastChunkIndex = resolvedIndex;
    this.clearTimeoutGuard();
    this.dispatchEvent({ index: resolvedIndex, text: sanitized });
  }

  private sanitizeText(text: string) {
    return text.replace(/\r/g, " ").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
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
