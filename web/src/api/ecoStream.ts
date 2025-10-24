import { decodeSseChunk } from "../utils/decodeSse";
import { getGuestIdHeader, rememberGuestIdFromResponse } from "../utils/guest";
import { getSessionIdHeader, rememberSessionIdFromResponse } from "../utils/session";

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
  | { type: "meta"; data: Record<string, unknown> }
  | { type: "memory_saved"; saved: boolean; meta?: Record<string, unknown> }
  | { type: "done"; meta?: Record<string, unknown>; at?: number; sinceStartMs?: number; timings?: EcoLatencyTimings; content?: string | null }
  | { type: "error"; message: string }
  | EcoLatencyEvent;

type EcoServerEvent =
  | { type: "prompt_ready"; at?: number; sinceStartMs?: number; timings?: EcoLatencyTimings }
  | { type: "first_token" }
  | { type: "chunk"; delta?: string; content?: string; index?: number }
  | { type: "meta"; data?: Record<string, unknown>; meta?: Record<string, unknown> }
  | { type: "memory_saved"; meta?: Record<string, unknown>; saved?: boolean; value?: boolean }
  | { type: "done"; meta?: Record<string, unknown>; at?: number; sinceStartMs?: number; timings?: EcoLatencyTimings; content?: string | null }
  | { type: "error"; message?: string; error?: { message?: string } | string }
  | EcoLatencyEvent
  | { type: "control"; name: string; timings?: EcoLatencyTimings; meta?: Record<string, unknown>; attempt?: number }
  | Record<string, unknown>
  | string;

export function normalizeServerEvent(event: EcoServerEvent, rawEventName?: string): EcoClientEvent[] {
  const sanitizeChunkText = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return value.length > 0 ? value : null;
    }
    if (trimmed === "__prompt_ready__" || trimmed === "prompt_ready") {
      return null;
    }
    return value;
  };

  const coerceNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  };

  const emitChunk = (delta: unknown, index: unknown): EcoClientEvent[] => {
    const text = sanitizeChunkText(delta);
    if (!text) {
      return [];
    }
    const resolvedIndex = coerceNumber(index) ?? 0;
    return [{ type: "chunk", delta: text, index: resolvedIndex }];
  };

  if (typeof event === "string") {
    if (rawEventName === "first_token") {
      const chunkEvents = emitChunk(event, 0);
      return chunkEvents.length ? [{ type: "first_token" }, ...chunkEvents] : [{ type: "first_token" }];
    }
    return emitChunk(event, 0);
  }

  if (!event || typeof event !== "object") {
    if (rawEventName === "first_token") {
      return [{ type: "first_token" }];
    }
    if (rawEventName === "chunk" || rawEventName === "token") {
      return emitChunk(event, 0);
    }
    return [];
  }

  const asChunkEvent = (delta: unknown, index: unknown): EcoClientEvent[] => emitChunk(delta, index);

  switch ((event as any).type) {
    case "prompt_ready":
      return [
        {
          type: "prompt_ready",
          at: coerceNumber((event as any).at),
          sinceStartMs: coerceNumber((event as any).sinceStartMs),
          timings: (event as any).timings,
        },
      ];
    case "first_token":
      return [{ type: "first_token" }];
    case "chunk":
      return asChunkEvent(
        (event as any).delta ?? (event as any).text ?? (event as any).content,
        (event as any).index
      );
    case "meta": {
      const data =
        (event as any).data && typeof (event as any).data === "object"
          ? ((event as any).data as Record<string, unknown>)
          : (event as any).meta && typeof (event as any).meta === "object"
          ? ((event as any).meta as Record<string, unknown>)
          : {};
      return [{ type: "meta", data }];
    }
    case "memory_saved": {
      const meta =
        (event as any).meta && typeof (event as any).meta === "object"
          ? ((event as any).meta as Record<string, unknown>)
          : undefined;
      const savedRaw =
        typeof (event as any).saved === "boolean"
          ? (event as any).saved
          : typeof (event as any).value === "boolean"
          ? (event as any).value
          : Boolean(meta);
      return [{ type: "memory_saved", saved: savedRaw, meta }];
    }
    case "done":
      return [
        {
          type: "done",
          meta: (event as any).meta,
          at: coerceNumber((event as any).at),
          sinceStartMs: coerceNumber((event as any).sinceStartMs),
          timings: (event as any).timings,
          content:
            typeof (event as any).content === "string"
              ? (event as any).content
              : undefined,
        },
      ];
    case "error": {
      const errPayload = event as any;
      const message =
        typeof errPayload.message === "string"
          ? errPayload.message
          : typeof errPayload.error === "string"
          ? errPayload.error
          : errPayload.error && typeof errPayload.error === "object" && typeof errPayload.error.message === "string"
          ? errPayload.error.message
          : "Erro desconhecido";
      return [{ type: "error", message }];
    }
    case "latency": {
      const latency = event as EcoLatencyEvent;
      if (latency.stage === "prompt_ready" || latency.stage === "ttfb" || latency.stage === "ttlc") {
        return [
          {
            type: "latency",
            stage: latency.stage,
            at: coerceNumber(latency.at) ?? Date.now(),
            sinceStartMs: coerceNumber(latency.sinceStartMs) ?? 0,
            timings: latency.timings,
          },
        ];
      }
      return [];
    }
    case "control": {
      const control = event as { name?: string; timings?: EcoLatencyTimings; meta?: Record<string, unknown>; attempt?: number };
      if (control.name === "prompt_ready") {
        return [
          {
            type: "prompt_ready",
            timings: control.timings,
          },
        ];
      }
      if (control.name === "first_token") {
        return [{ type: "first_token" }];
      }
      if (control.name === "meta") {
        const data = control.meta && typeof control.meta === "object" ? control.meta : {};
        return [{ type: "meta", data }];
      }
      if (control.name === "memory_saved") {
        const meta = control.meta && typeof control.meta === "object" ? control.meta : undefined;
        return [{ type: "memory_saved", saved: true, meta }];
      }
      if (control.name === "done") {
        return [
          {
            type: "done",
            meta: control.meta,
            timings: control.timings,
          },
        ];
      }
      return [];
    }
    default:
      break;
  }

  if (typeof rawEventName === "string") {
    const payloadAny = event as any;
    const fallback = rawEventName.toLowerCase();
    if (fallback === "first_token") {
      const chunkEvents = asChunkEvent(
        payloadAny?.delta ?? payloadAny?.text ?? payloadAny?.content,
        payloadAny?.index
      );
      return chunkEvents.length ? [{ type: "first_token" }, ...chunkEvents] : [{ type: "first_token" }];
    }
    if (fallback === "chunk" || fallback === "token") {
      return asChunkEvent(payloadAny?.delta ?? payloadAny?.text ?? payloadAny?.content, payloadAny?.index);
    }
    if (fallback === "meta") {
      const data =
        payloadAny && typeof payloadAny === "object"
          ? ((payloadAny.meta ?? payloadAny.data ?? {}) as Record<string, unknown>)
          : {};
      return [{ type: "meta", data }];
    }
    if (fallback === "memory_saved") {
      const meta =
        payloadAny && typeof payloadAny === "object" && payloadAny.meta && typeof payloadAny.meta === "object"
          ? (payloadAny.meta as Record<string, unknown>)
          : undefined;
      return [{ type: "memory_saved", saved: true, meta }];
    }
    if (fallback === "done") {
      if (payloadAny && typeof payloadAny === "object" && payloadAny.done === true) {
        return [{ type: "done" }];
      }
      return [{ type: "done" }];
    }
  }

  return [];
}
export interface StartEcoStreamParams {
  body: unknown;
  token: string;
  onEvent: (event: EcoClientEvent) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
  endpoint?: string;
  streamId?: string;
  headers?: Record<string, string | undefined>;
}

export interface EcoStreamHandle {
  close: () => void;
  finished: Promise<void>;
}

const activeStreamState: {
  controller: AbortController | null;
} = {
  controller: null,
};

function createAbortError(reason: string): Error {
  const error = new Error(reason);
  error.name = "AbortError";
  return error;
}

export function startEcoStream({
  body,
  token,
  onEvent,
  onError,
  signal,
  endpoint = "/ask-eco",
  streamId,
  headers,
}: StartEcoStreamParams): EcoStreamHandle {
  const controller = new AbortController();

  if (activeStreamState.controller && activeStreamState.controller !== controller) {
    try {
      activeStreamState.controller.abort(createAbortError("superseded_stream"));
    } catch {
      /* ignore abort propagation failures */
    }
  }
  activeStreamState.controller = controller;

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

  const finalizeActiveStream = () => {
    if (activeStreamState.controller === controller) {
      activeStreamState.controller = null;
    }
  };

  const finished = (async () => {
    try {
      const guestId = getGuestIdHeader();
      const sessionId = getSessionIdHeader();
      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(guestId ? { "X-Eco-Guest-Id": guestId } : {}),
        ...(sessionId ? { "X-Eco-Session-Id": sessionId } : {}),
      };

      if (streamId && streamId.trim()) {
        requestHeaders["X-Stream-Id"] = streamId.trim();
      }

      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          if (typeof value === "string" && value.trim()) {
            requestHeaders[key] = value;
          }
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: requestHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      rememberGuestIdFromResponse(response);
      rememberSessionIdFromResponse(response);

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
              const normalizedEvents = normalizeServerEvent(payload, entry.event);
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
            const normalizedEvents = normalizeServerEvent(payload, entry.event);
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
  })().finally(finalizeActiveStream);

  return {
    close: () => {
      finalizeActiveStream();
      controller.abort(createAbortError("client_closed"));
    },
    finished,
  };
}
