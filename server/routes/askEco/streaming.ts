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

function normalizeTimings(
  timings: LatencyTimings,
): Record<string, number | null> | null {
  if (!timings || typeof timings !== "object") {
    return null;
  }

  const entries = Object.entries(timings).reduce<Record<string, number | null>>(
    (accumulator, [key, value]) => {
      if (value === undefined || value === null) {
        accumulator[key] = null;
        return accumulator;
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        accumulator[key] = value;
        return accumulator;
      }

      return accumulator;
    },
    {},
  );

  return Object.keys(entries).length > 0 ? entries : null;
}

type StreamSessionOptions = {
  req: Request | Record<string, unknown>;
  res: Response | { [key: string]: any };
  respondAsStream: boolean;
  activationTracer?: ActivationTracerLike | null;
  startTime: number;
  debugRequested?: boolean;
  streamId: string;
};

type StreamEventPayload = Record<string, unknown> & { type: string };

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

export const HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_DEFAULT_MS;
export const STREAM_TIMEOUT_GUARD_MS = resolveTimeoutGuardMs();
export const STREAM_TIMEOUT_MESSAGE = STREAM_TIMEOUT_FALLBACK_MESSAGE;

const NOW = () => Date.now();

export class StreamSession {
  public readonly streamId: string;
  public readonly startedAt: number;
  public readonly respondAsStream: boolean;

  public aggregatedText = "";
  public chunkReceived = false;
  public lastChunkIndex = -1;
  public offlineEvents: StreamEventPayload[] = [];
  public latestTimings: Record<string, number | null> | null = null;
  public cacheCandidateMeta: Record<string, unknown> | null = null;
  public cacheCandidateTimings: Record<string, number | null> | null = null;

  private readonly req: Request | Record<string, unknown>;
  private readonly res: Response | { [key: string]: any };
  private readonly activationTracer?: ActivationTracerLike | null;
  private readonly debugRequested: boolean;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private timeoutGuard: NodeJS.Timeout | null = null;
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

  public initialize(promptReadyImmediate: boolean): void {
    if (this.respondAsStream) {
      this.openSseChannel();
      this.startHeartbeat();
    }

    this.armTimeoutGuard();

    if (promptReadyImmediate) {
      const timestamp = NOW();
      this.emitLatency("prompt_ready", timestamp, null);
    }
  }

  public emitLatency(name: string, at: number, timings: LatencyTimings): void {
    const timestamp = Number.isFinite(at) ? at : NOW();
    const sinceStartMs = Math.max(0, timestamp - this.startedAt);
    const payload: StreamEventPayload = {
      type: "latency",
      name,
      at: timestamp,
      sinceStartMs,
      timings: normalizeTimings(timings),
    };

    if (this.respondAsStream) {
      this.writeSse("latency", payload);
    }

    this.offlineEvents.push(payload);
  }

  public markLatestTimings(timings: LatencyTimings): void {
    if (!timings) {
      this.latestTimings = null;
      return;
    }

    const normalized = normalizeTimings(timings);
    this.latestTimings = normalized;
  }

  public dispatchEvent(event: StreamEventPayload): void {
    if (!event || typeof event !== "object") return;

    const timestamp = NOW();
    const sinceStartMs = Math.max(0, timestamp - this.startedAt);
    const normalized: StreamEventPayload = {
      ...event,
      at: timestamp,
      sinceStartMs,
    };

    this.offlineEvents.push(normalized);

    if (!this.respondAsStream) {
      this.trackOfflineAggregation(normalized);
      return;
    }

    switch (normalized.type) {
      case "message": {
        this.trackOfflineAggregation(normalized);
        const chunkIndex = this.lastChunkIndex;
        const text = this.resolveChunkText(normalized);
        const payload = {
          ...normalized,
          streamId: this.streamId,
          index: chunkIndex,
          delta: text,
          text,
        };
        this.writeSse("chunk", payload);
        break;
      }
      case "done": {
        const payload = {
          ...normalized,
          streamId: this.streamId,
          done: true,
          index: this.lastChunkIndex + 1,
          aggregatedText: this.aggregatedText || undefined,
          timings: normalized.timings ?? this.latestTimings ?? null,
        };
        this.writeSse("done", payload);
        this.clearTimeoutGuard();
        break;
      }
      case "prompt_ready": {
        const payload = {
          ...normalized,
          streamId: this.streamId,
        };
        this.writeSse("prompt_ready", payload);
        break;
      }
      default: {
        const payload = {
          ...normalized,
          streamId: this.streamId,
        };
        this.writeSse(normalized.type, payload);
        break;
      }
    }
  }

  public clearTimeoutGuard(): void {
    if (this.timeoutGuard) {
      clearTimeout(this.timeoutGuard);
      this.timeoutGuard = null;
    }
  }

  public end(): void {
    if (this.ended) return;
    this.ended = true;
    this.stopHeartbeat();
    this.clearTimeoutGuard();

    if (this.respondAsStream && typeof (this.res as any).end === "function") {
      try {
        (this.res as any).end();
      } catch (error) {
        log.warn("[stream-session] failed to end response", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private openSseChannel(): void {
    if (this.sseOpened) return;
    this.sseOpened = true;

    const res = this.res as any;
    const req = this.req as any;

    try {
      res.setHeader?.("X-Stream-Id", this.streamId);
      const originHeader = typeof req?.headers?.origin === "string" ? req.headers.origin : null;
      prepareSse(res, originHeader);
      res.flush?.();
      res.flushHeaders?.();
    } catch (error) {
      log.warn("[stream-session] failed to open SSE channel", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendHeartbeat(): void {
    if (!this.respondAsStream || this.ended) return;
    const payload: StreamEventPayload = {
      type: "ping",
      streamId: this.streamId,
      at: NOW(),
    };
    this.writeSse("control", payload);
  }

  private armTimeoutGuard(): void {
    if (this.timeoutGuard || STREAM_TIMEOUT_GUARD_MS <= 0) return;
    this.timeoutGuard = setTimeout(() => this.handleTimeoutGuard(), STREAM_TIMEOUT_GUARD_MS);
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

    const timeoutEvent: StreamEventPayload = {
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

    if (this.respondAsStream) {
      const payload = {
        ...timeoutEvent,
        streamId: this.streamId,
        done: true,
        index: this.lastChunkIndex + 1,
      };
      this.writeSse("done", payload);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

    this.activationTracer?.addError?.("timeout", STREAM_TIMEOUT_MESSAGE);
    this.activationTracer?.markTotal?.();

    this.end();
  }

  private writeSse(eventName: string, data: Record<string, unknown>): void {
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

    const idLine = `id: ${this.nextEventId}\n`;
    const eventLine = `event: ${eventName}\n`;
    const dataLine = `data: ${serialized}\n\n`;
    this.nextEventId += 1;

    res.write(idLine);
    res.write(eventLine);
    res.write(dataLine);
  }

  private trackOfflineAggregation(event: StreamEventPayload): void {
    if (event.type !== "message") {
      return;
    }

    const text = this.resolveChunkText(event);
    if (text) {
      this.aggregatedText = this.aggregatedText ? `${this.aggregatedText}${text}` : text;
      this.chunkReceived = true;
    }

    const nextIndex =
      typeof event.index === "number" && Number.isFinite(event.index)
        ? event.index
        : this.lastChunkIndex + 1;

    this.lastChunkIndex = nextIndex;
  }

  private resolveChunkText(event: StreamEventPayload): string {
    const delta = event.delta;
    if (typeof delta === "string" && delta) {
      return delta;
    }
    const text = event.text;
    if (typeof text === "string" && text) {
      return text;
    }
    const content = event.content;
    if (typeof content === "string" && content) {
      return content;
    }
    return "";
  }
}

