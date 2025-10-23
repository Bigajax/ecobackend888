import {
  startEcoStream,
  type EcoClientEvent,
  type EcoStreamHandle,
  type EcoLatencyEvent,
  type EcoLatencyTimings,
  type EcoLatencyStage,
} from "./ecoStream";
import { smartJoin } from "../utils/streamJoin";
import { postSignal } from "./signals";

const LAST_INTERACTION_STORAGE_KEY = "eco.last_interaction_id";

function persistInteractionId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LAST_INTERACTION_STORAGE_KEY, id ?? "");
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}

function extractInteractionId(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const raw = (meta as Record<string, unknown>)["interaction_id"];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

export interface StreamAnalyticsDurations {
  promptReadyMs?: number;
  ttfbMs?: number;
  ttlcMs?: number;
  abortMs?: number;
}

export interface StreamAnalyticsPayload {
  reason: "completed" | "aborted" | "error";
  startedAt: number;
  finishedAt: number;
  durations: StreamAnalyticsDurations;
  latencies: Partial<Record<EcoLatencyStage, EcoLatencyEvent>>;
  timings?: EcoLatencyTimings;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onEvent?: (event: EcoClientEvent) => void;
  onError?: (error: Error) => void;
  onLatency?: (latency: EcoLatencyEvent) => void;
  onAnalytics?: (payload: StreamAnalyticsPayload) => void;
}

export interface StreamConversationParams {
  payload: unknown;
  token: string;
  signal?: AbortSignal;
  endpoint?: string;
  callbacks: StreamCallbacks;
}

export interface ConversationStream {
  close: () => void;
  finished: Promise<void>;
}

export function streamConversation({
  payload,
  token,
  signal,
  endpoint,
  callbacks,
}: StreamConversationParams): ConversationStream {
  let aggregated = "";
  const startedAt = Date.now();
  const latencies: Partial<Record<EcoLatencyStage, EcoLatencyEvent>> = {};
  let analyticsSent = false;
  let lifecycleSignalsSent = false;
  let lastChunkIndex: number | null = null;

  const emitAnalytics = (
    reason: "completed" | "aborted" | "error",
    options: { finishedAt?: number; event?: EcoLatencyEvent } = {}
  ) => {
    if (analyticsSent) return;
    analyticsSent = true;
    const finishedAt = options.finishedAt ?? Date.now();
    const durations: StreamAnalyticsDurations = {
      promptReadyMs: latencies.prompt_ready?.sinceStartMs,
      ttfbMs: latencies.ttfb?.sinceStartMs,
      ttlcMs: reason === "completed" ? latencies.ttlc?.sinceStartMs : undefined,
      abortMs: reason === "aborted" ? finishedAt - startedAt : undefined,
    };
    const timings =
      latencies.ttlc?.timings ??
      latencies.prompt_ready?.timings ??
      latencies.ttfb?.timings ??
      options.event?.timings;

    callbacks.onAnalytics?.({
      reason,
      startedAt,
      finishedAt,
      durations,
      latencies: { ...latencies },
      timings,
    });
  };

  const registerLatency = (entry: EcoLatencyEvent) => {
    latencies[entry.stage] = entry;
    callbacks.onLatency?.(entry);
    if (entry.stage === "ttlc") {
      emitAnalytics("completed", { finishedAt: Date.now(), event: entry });
    }
  };

  const markAbort = () => {
    if (analyticsSent) return;
    const at = Date.now();
    const abortEvent: EcoLatencyEvent = {
      type: "latency",
      stage: "abort",
      at,
      sinceStartMs: at - startedAt,
    };
    latencies.abort = abortEvent;
    callbacks.onLatency?.(abortEvent);
    emitAnalytics("aborted", { finishedAt: at });
  };

  const handle: EcoStreamHandle = startEcoStream({
    body: payload,
    token,
    signal,
    endpoint,
    onEvent: (event) => {
      if (event.type === "latency") {
        registerLatency(event);
      }

      if (event.type === "done" && !lifecycleSignalsSent) {
        const interactionId = extractInteractionId(event.meta);
        persistInteractionId(interactionId);
        lifecycleSignalsSent = true;
        void postSignal("first_token", { interaction_id: interactionId });
        void postSignal("done", { interaction_id: interactionId });
        void postSignal("view", { interaction_id: interactionId });
      }

      if (event.type === "chunk") {
        const numericIndex =
          typeof event.index === "number" && Number.isFinite(event.index)
            ? event.index
            : null;
        if (numericIndex !== null) {
          if (lastChunkIndex !== null && numericIndex <= lastChunkIndex) {
            return;
          }
          lastChunkIndex = numericIndex;
        } else if (lastChunkIndex === null) {
          lastChunkIndex = 0;
        } else {
          lastChunkIndex += 1;
        }
        callbacks.onEvent?.(event);
        aggregated = smartJoin(aggregated, event.delta);
        // LATENCY: repassa o texto parcial para atualizar o UI em tempo real.
        callbacks.onText?.(aggregated);
        return;
      }

      callbacks.onEvent?.(event);

      if (event.type === "done" && callbacks.onText) {
        callbacks.onText(aggregated);
      }
    },
    onError: (error) => {
      emitAnalytics("error", { finishedAt: Date.now() });
      callbacks.onError?.(error);
    },
  });

  if (signal) {
    if (signal.aborted) {
      markAbort();
    } else {
      signal.addEventListener("abort", markAbort, { once: true });
    }
  }

  return {
    close: () => {
      markAbort();
      handle.close();
    },
    finished: handle.finished,
  };
}
