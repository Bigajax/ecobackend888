import { decodeSseChunk } from "../utils/decodeSse";

export type EcoLatencyStage = "prompt_ready" | "ttfb" | "ttlc" | "abort";

export interface EcoLatencyTimings {
  contextBuildStart?: number;
  contextBuildEnd?: number;
  llmStart?: number;
  llmEnd?: number;
}

export interface EcoLatencyEvent {
  type: "latency";
  stage: EcoLatencyStage;
  at: number;
  sinceStartMs: number;
  timings?: EcoLatencyTimings;
}

export type EcoClientEvent =
  | { type: "prompt_ready"; at?: number; sinceStartMs?: number; timings?: EcoLatencyTimings }
  | { type: "first_token" }
  | { type: "chunk"; delta: string; index: number }
  | { type: "reconnect"; attempt?: number }
  | { type: "done"; meta?: Record<string, unknown>; at?: number; sinceStartMs?: number; timings?: EcoLatencyTimings }
  | { type: "error"; message: string }
  | EcoLatencyEvent;

type EcoServerEvent =
  | { type: "prompt_ready"; at?: number; sinceStartMs?: number; timings?: EcoLatencyTimings }
  | { type: "first_token" }
  | { type: "chunk"; delta?: string; content?: string; index?: number }
  | { type: "reconnect"; attempt?: number }
  | { type: "done"; meta?: Record<string, unknown>; at?: number; sinceStartMs?: number; timings?: EcoLatencyTimings }
  | { type: "error"; message?: string; error?: { message?: string } | string }
  | EcoLatencyEvent
  | { type: "control"; name: string; timings?: EcoLatencyTimings; meta?: Record<string, unknown>; attempt?: number }
  | Record<string, unknown>;

function normalizeServerEvent(event: EcoServerEvent): EcoClientEvent[] {
  if (!event || typeof event !== "object") {
    return [];
  }

  const coerceNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  };

  const asChunkEvent = (delta: unknown, index: unknown): EcoClientEvent[] => {
    if (typeof delta !== "string" || delta.length === 0) {
      return [];
    }
    const resolvedIndex = coerceNumber(index) ?? 0;
    return [{ type: "chunk", delta, index: resolvedIndex }];
  };

  switch (event.type) {
    case "prompt_ready":
      return [
        {
          type: "prompt_ready",
          at: coerceNumber(event.at),
          sinceStartMs: coerceNumber(event.sinceStartMs),
          timings: event.timings,
        },
      ];
    case "first_token":
      return [{ type: "first_token" }];
    case "chunk":
      return asChunkEvent(event.delta ?? event.content, event.index);
    case "reconnect":
      return [{ type: "reconnect", attempt: coerceNumber(event.attempt) }];
    case "done":
      return [
        {
          type: "done",
          meta: event.meta,
          at: coerceNumber(event.at),
          sinceStartMs: coerceNumber(event.sinceStartMs),
          timings: event.timings,
        },
      ];
    case "error": {
      const message =
        typeof event.message === "string"
          ? event.message
          : typeof event.error === "string"
          ? event.error
          : event.error && typeof event.error === "object" && typeof event.error.message === "string"
          ? event.error.message
          : "Erro desconhecido";
      return [{ type: "error", message }];
    }
    case "latency":
      if (
        event.stage === "prompt_ready" ||
        event.stage === "ttfb" ||
        event.stage === "ttlc"
      ) {
        return [
          {
            type: "latency",
            stage: event.stage,
            at: coerceNumber(event.at) ?? Date.now(),
            sinceStartMs: coerceNumber(event.sinceStartMs) ?? 0,
            timings: event.timings,
          },
        ];
      }
      return [];
    case "control": {
      const { name } = event;
      if (name === "prompt_ready") {
        return [
          {
            type: "prompt_ready",
            timings: event.timings,
          },
        ];
      }
      if (name === "first_token") {
        return [{ type: "first_token" }];
      }
      if (name === "reconnect") {
        return [{ type: "reconnect", attempt: coerceNumber(event.attempt) }];
      }
      if (name === "done") {
        return [
          {
            type: "done",
            meta: event.meta,
            timings: event.timings,
          },
        ];
      }
      // Outros eventos de controle (meta/meta_pending/memory_saved) não têm representação direta
      // no cliente atual, então são ignorados silenciosamente.
      return [];
    }
    default:
      return [];
  }
}

export interface StartEcoStreamParams {
  body: unknown;
  token: string;
  onEvent: (event: EcoClientEvent) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
  endpoint?: string;
}

export interface EcoStreamHandle {
  close: () => void;
  finished: Promise<void>;
}

export function startEcoStream({
  body,
  token,
  onEvent,
  onError,
  signal,
  endpoint = "/ask-eco",
}: StartEcoStreamParams): EcoStreamHandle {
  const controller = new AbortController();

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener(
        "abort",
        () => {
          controller.abort(signal.reason);
        },
        { once: true }
      );
    }
  }

  const finished = (async () => {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`Eco stream HTTP ${response.status}`);
        onError?.(error);
        throw error;
      }

      const stream = response.body;
      if (!stream) {
        const error = new Error("Fluxo SSE indisponível na resposta");
        onError?.(error);
        throw error;
      }

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        // LATENCY: decodifica chunk do fetch imediatamente para minimizar atraso visual.
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const rawPacket = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const decoded = decodeSseChunk(rawPacket);

          for (const entry of decoded) {
            if (!entry.data) continue;
            try {
              const payload = JSON.parse(entry.data) as EcoServerEvent;
              const normalizedEvents = normalizeServerEvent(payload);
              for (const normalized of normalizedEvents) {
                // LATENCY: entrega cada token/control para renderização imediata.
                onEvent(normalized);
              }
            } catch (parseErr) {
              console.warn("[startEcoStream] Falha ao decodificar SSE:", parseErr);
            }
          }

          boundary = buffer.indexOf("\n\n");
        }
      }

      if (buffer.trim()) {
        const tail = decodeSseChunk(buffer);
        for (const entry of tail) {
          if (!entry.data) continue;
          try {
            const payload = JSON.parse(entry.data) as EcoServerEvent;
            const normalizedEvents = normalizeServerEvent(payload);
            for (const normalized of normalizedEvents) {
              onEvent(normalized);
            }
          } catch (parseErr) {
            console.warn("[startEcoStream] Falha ao decodificar resto do SSE:", parseErr);
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      throw err;
    }
  })();

  return {
    close: () => controller.abort(),
    finished,
  };
}
