import { decodeSseChunk } from "../utils/decodeSse";

export type EcoClientEvent =
  | { type: "prompt_ready" }
  | { type: "first_token" }
  | { type: "chunk"; delta: string; index: number }
  | { type: "reconnect"; attempt?: number }
  | { type: "done"; meta?: Record<string, unknown> }
  | { type: "error"; message: string };

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
              const payload = JSON.parse(entry.data) as EcoClientEvent;
              // LATENCY: entrega cada token/control para renderização imediata.
              onEvent(payload);
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
            const payload = JSON.parse(entry.data) as EcoClientEvent;
            onEvent(payload);
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
