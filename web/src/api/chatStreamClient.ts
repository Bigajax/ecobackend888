import { startEcoStream, type EcoClientEvent, type EcoStreamHandle } from "./ecoStream";

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onEvent?: (event: EcoClientEvent) => void;
  onError?: (error: Error) => void;
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

  const handle: EcoStreamHandle = startEcoStream({
    body: payload,
    token,
    signal,
    endpoint,
    onEvent: (event) => {
      callbacks.onEvent?.(event);

      if (event.type === "chunk") {
        aggregated += event.delta;
        // LATENCY: repassa o texto parcial para atualizar o UI em tempo real.
        callbacks.onText?.(aggregated);
      }

      if (event.type === "done" && callbacks.onText) {
        callbacks.onText(aggregated);
      }
    },
    onError: callbacks.onError,
  });

  return {
    close: () => handle.close(),
    finished: handle.finished,
  };
}
