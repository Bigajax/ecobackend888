import type { Request, Response } from "express";

import { prepareSse } from "../../utils/sse";
import { log } from "../../services/promptContext/logger";
import type { EcoLatencyMarks } from "../../services/conversation/types";

type ActivationTracerLike = {
  markTotal?: () => void;
  addError?: (stage: string, message: string) => void;
  snapshot?: () => unknown;
};

type LatencyTimings =
  | Record<string, number | null | undefined>
  | EcoLatencyMarks
  | null
  | undefined;

type StreamSessionOptions = {
  req: Request | Record<string, unknown>;
  res: Response | { [key: string]: any };
  respondAsStream: boolean;
  activationTracer?: ActivationTracerLike | null;
  startTime: number;
  debugRequested?: boolean;
  streamId: string;
};

type StreamMessageEvent = {
  type: "message";
  index?: number;
  text?: string;
  delta?: unknown;
  content?: unknown;
  timings?: Record<string, number | null | undefined> | null;
  [key: string]: unknown;
};

type StreamDoneEvent = {
  type: "done";
  message?: string;
  timings?: Record<string, number | null | undefined> | null;
  [key: string]: unknown;
};

type StreamErrorEvent = {
  type: "error";
  message: string;
  timings?: Record<string, number | null | undefined> | null;
  [key: string]: unknown;
};

type DispatchableEvent = StreamMessageEvent | StreamDoneEvent | StreamErrorEvent;

type OfflineEvent = (DispatchableEvent | { type: string; [key: string]: unknown }) & {
  at?: number;
  sinceStartMs?: number;
};

const HEARTBEAT_INTERVAL_DEFAULT_MS = 2_000;
const STREAM_TIMEOUT_DEFAULT_MS = 60_000;
const STREAM_TIMEOUT_FALLBACK_MESSAGE =
  "Não consegui responder agora. Vamos tentar de novo?";

function resolveTimeoutGuardMs(): number {
  const raw = process.env.ECO_SSE_TIMEOUT_MS;
  if (!raw) return STREAM_TIMEOUT_DEFAULT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return STREAM_TIMEOUT_DEFAULT_MS;
  }
  return parsed;
}

const HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_DEFAULT_MS;
const STREAM_TIMEOUT_GUARD_MS = resolveTimeoutGuardMs();
const STREAM_TIMEOUT_MESSAGE = STREAM_TIMEOUT_FALLBACK_MESSAGE;

const NOW = () => Date.now();

class StreamSession {
  public readonly streamId: string;
  public readonly startedAt: number;
  public readonly respondAsStream: boolean;

  public aggregatedText = "";
  public chunkReceived = false;
  public lastChunkIndex = -1;
  public offlineEvents: OfflineEvent[] = [];
  public latestTimings: Record<string, number | null> | null = null;
  public cacheCandidateMeta: Record<string, unknown> | null = null;
  public cacheCandidateTimings: Record<string, number | null> | null = null;

  private readonly req: Request | Record<string, unknown>;
  private readonly res: Response | { [key: string]: any };
  private readonly activationTracer?: ActivationTracerLike | null;
  private readonly debugRequested: boolean;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private timeoutGuard: NodeJS.Timeout | null = null;
  private timeoutGuardHandler: (() => void) | null = null;
  private ended = false;
  private sseOpened = false;
  private nextEventId = 0;

  constructor(options: StreamSessionOptions) {
    this.req = options.req;
    this.res = options.res;
    this.respondAsStream = Boolean(options.respondAsStream);
    this.activationTracer = options.activationTracer ?? undefined;
    this.startedAt = Number.isFinite(options.startTime)
      ? Number(options.startTime)
      : NOW();
    this.debugRequested = Boolean(options.debugRequested);
    this.streamId = options.streamId;
  }

  public initialize(atOnce: boolean): void {
    if (this.respondAsStream) {
      this.openSseChannel();
      this.ensureHeartbeat();
    }

    this.ensureTimeoutGuard();

    if (atOnce && this.respondAsStream) {
      this.sendPromptReadyControl();
    }

    if (atOnce) {
      const timestamp = NOW();
      this.emitLatency("prompt_ready", timestamp, null);
    }
  }

  public emitLatency(
    stage: string,
    at: number,
    timings?: LatencyTimings,
  ): void {
    const timestamp = Number.isFinite(at) ? at : NOW();
    const sinceStartMs = Math.max(0, timestamp - this.startedAt);
    const payload: OfflineEvent = {
      type: "latency",
      stage,
      at: timestamp,
      sinceStartMs,
      timings: this.toTimingRecord(
        (timings as Record<string, number | null | undefined> | null) ?? null,
      ),
    };

    if (this.respondAsStream) {
      this.writeSseEvent("latency", payload);
    }

    this.offlineEvents.push(payload);
  }

  public end(reason?: "done" | "timeout" | "abort" | "error"): void {
    if (this.ended) return;
    this.ended = true;
    this.stopHeartbeat();
    this.clearTimeoutGuard();

    if (reason && reason !== "done" && reason !== "timeout") {
      this.activationTracer?.addError?.(reason, STREAM_TIMEOUT_MESSAGE);
    }

    if (this.respondAsStream && typeof (this.res as any).end === "function") {
      try {
        (this.res as any).end();
      } catch (error) {
        log.warn("[stream-session] failed to end response", {
          streamId: this.streamId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  public dispatchEvent(event: DispatchableEvent): void {
    if (!event || typeof event !== "object") return;

    const timestamp = NOW();
    const sinceStartMs = Math.max(0, timestamp - this.startedAt);
    const normalized: OfflineEvent = { ...event, at: timestamp, sinceStartMs };

    switch (event.type) {
      case "message": {
        const chunk = this.processChunk(event);
        if (!chunk) break;

        this.handleChunk(chunk, normalized);
        break;
      }
      case "done": {
        this.handleDoneEvent(normalized);
        break;
      }
      case "error": {
        this.handleErrorEvent(normalized);
        break;
      }
      default: {
        break;
      }
    }

    this.offlineEvents.push(normalized);
  }

  public clearTimeoutGuard(): void {
    if (this.timeoutGuard) {
      clearTimeout(this.timeoutGuard);
      this.timeoutGuard = null;
    }
    this.timeoutGuardHandler = null;
  }

  public markLatestTimings(timings: LatencyTimings): void {
    this.latestTimings = this.toTimingRecord(
      (timings as Record<string, number | null | undefined> | null) ?? null,
    );
  }

  public cacheCandidateTimingsFrom(event: { timings?: LatencyTimings | undefined }): void {
    this.cacheCandidateTimings = this.toTimingRecord(
      (event.timings as Record<string, number | null | undefined> | null) ??
        (this.latestTimings as Record<string, number | null | undefined> | null),
    );
  }

  private openSseChannel(): void {
    if (this.sseOpened) return;
    this.sseOpened = true;

    const res = this.res as any;
    const req = this.req as any;

    try {
      res.setHeader?.("X-Stream-Id", this.streamId);
      const originHeader =
        typeof req?.headers?.origin === "string" ? req.headers.origin : null;
      prepareSse(res, originHeader);
      res.flush?.();
      res.flushHeaders?.();
    } catch (error) {
      log.warn("[stream-session] failed to open SSE channel", {
        streamId: this.streamId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer || !this.respondAsStream) return;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendHeartbeat(): void {
    if (!this.respondAsStream || this.ended) return;
    const timestamp = NOW();
    const sinceStartMs = Math.max(0, timestamp - this.startedAt);
    const payload = {
      type: "ping",
      at: timestamp,
      sinceStartMs,
    };
    this.writeSseControl("ping", payload);
  }

  private ensureTimeoutGuard(): void {
    if (this.timeoutGuard || STREAM_TIMEOUT_GUARD_MS <= 0) return;
    this.setTimeoutGuardHandler(() => this.handleTimeoutGuard());
    if (!this.timeoutGuardHandler) return;
    this.timeoutGuard = setTimeout(this.timeoutGuardHandler, STREAM_TIMEOUT_GUARD_MS);
  }

  private setTimeoutGuardHandler(handler: () => void): void {
    this.timeoutGuardHandler = handler;
  }

  private handleTimeoutGuard(): void {
    if (this.ended) return;

    const timestamp = NOW();
    const sinceStartMs = Math.max(0, timestamp - this.startedAt);

    log.warn("[stream-session] timeout guard triggered", {
      streamId: this.streamId,
      timeoutMs: STREAM_TIMEOUT_GUARD_MS,
      debugRequested: this.debugRequested,
    });

    const timeoutEvent: OfflineEvent = {
      type: "timeout",
      at: timestamp,
      sinceStartMs,
      message: STREAM_TIMEOUT_MESSAGE,
      guardFallback: true,
    };

    this.offlineEvents.push(timeoutEvent);
    this.aggregatedText = STREAM_TIMEOUT_MESSAGE;
    this.chunkReceived = true;
    this.lastChunkIndex = Math.max(this.lastChunkIndex, 0);
    this.activationTracer?.addError?.("timeout", STREAM_TIMEOUT_MESSAGE);
    this.activationTracer?.markTotal?.();

    if (this.respondAsStream) {
      const donePayload: OfflineEvent = {
        type: "done",
        message: STREAM_TIMEOUT_MESSAGE,
        done: true,
        index: this.lastChunkIndex + 1,
        aggregatedText: this.aggregatedText || undefined,
        timings: this.latestTimings ?? null,
      };
      this.writeSseEvent("done", donePayload);
    }

    this.end("timeout");
  }

  private writeSseEvent(eventName: string, data: Record<string, unknown>): void {
    if (!this.respondAsStream || this.ended) {
      return;
    }

    this.openSseChannel();

    const res = this.res as any;
    if (typeof res.write !== "function") return;

    const payload = {
      ...data,
      streamId: this.streamId,
    };

    let serialized: string;
    try {
      serialized = JSON.stringify(payload);
    } catch {
      serialized = JSON.stringify({ type: "invalid_payload" });
    }

    const frame =
      `id: ${this.nextEventId}\n` +
      `event: ${eventName}\n` +
      `data: ${serialized}\n\n`;

    this.logSseWrite(eventName, payload);

    try {
      res.write(frame);
      this.nextEventId += 1;
      res.__sseNextId = this.nextEventId;
    } catch (error) {
      log.warn("[stream-session] failed to write SSE", {
        streamId: this.streamId,
        eventName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private writeSseControl(controlName: string, data: Record<string, unknown>): void {
    const payload = { ...data, control: controlName };
    this.writeSseEvent("control", payload);
  }

  private sendPromptReadyControl(): void {
    if (!this.respondAsStream || this.ended) return;
    const timestamp = NOW();
    const sinceStartMs = Math.max(0, timestamp - this.startedAt);
    const payload = {
      type: "prompt_ready",
      at: timestamp,
      sinceStartMs,
    };
    this.writeSseControl("prompt_ready", payload);
  }

  private logSseWrite(eventName: string, payload: unknown): void {
    if (!this.debugRequested) return;
    log.debug("[stream-session] SSE write", {
      streamId: this.streamId,
      eventName,
      payload,
    });
  }

  private handleChunk(
    chunk: { index: number; text: string },
    normalizedEvent: OfflineEvent,
  ): void {
    const { index, text } = chunk;

    if (text) {
      this.aggregatedText = this.aggregatedText ? `${this.aggregatedText}${text}` : text;
      this.chunkReceived = true;
    }

    this.lastChunkIndex = index;

    Object.assign(normalizedEvent, {
      index,
      text,
      delta: text,
    });

    if (!this.respondAsStream) {
      return;
    }

    const payload: OfflineEvent = {
      ...normalizedEvent,
      type: "message",
    };

    this.writeSseEvent("message", payload);
  }

  private handleDoneEvent(normalizedEvent: OfflineEvent): void {
    this.cacheCandidateTimings = this.toTimingRecord(
      (normalizedEvent.timings as Record<string, number | null | undefined> | null) ??
        (this.latestTimings as Record<string, number | null | undefined> | null),
    );

    Object.assign(normalizedEvent, {
      done: true,
      index: this.lastChunkIndex + 1,
      aggregatedText: this.aggregatedText || undefined,
      timings: this.cacheCandidateTimings ?? this.latestTimings ?? null,
    });

    if (this.respondAsStream) {
      const payload: OfflineEvent = {
        ...normalizedEvent,
        type: "done",
      };
      this.writeSseEvent("done", payload);
    }

    this.clearTimeoutGuard();
  }

  private handleErrorEvent(normalizedEvent: OfflineEvent): void {
    if (this.respondAsStream) {
      this.writeSseEvent("error", normalizedEvent);
    }
    this.clearTimeoutGuard();
  }

  private processChunk(event: StreamMessageEvent):
    | { index: number; text: string }
    | null {
    const text = this.pickChunkText(event);
    if (!text) {
      return null;
    }

    const nextIndex =
      typeof event.index === "number" && Number.isFinite(event.index)
        ? event.index
        : this.lastChunkIndex + 1;

    return { index: nextIndex, text };
  }

  private pickChunkText(event: StreamMessageEvent): string {
    const candidates = [event.text, event.delta, event.content];
    for (const value of candidates) {
      if (typeof value === "string" && value) {
        return value;
      }
    }
    return "";
  }

  private toTimingRecord(
    t?: Record<string, number | null | undefined> | null,
  ): Record<string, number | null> | null {
    if (!t) return null;
    const out: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(t)) out[k] = v == null ? null : v;
    return out;
  }
}

export {
  HEARTBEAT_INTERVAL_MS,
  STREAM_TIMEOUT_GUARD_MS,
  STREAM_TIMEOUT_MESSAGE,
  StreamSession,
};

