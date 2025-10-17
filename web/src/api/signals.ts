import { getOrCreateGuestId } from "../utils/guest";

export interface SignalPayload {
  interaction_id: string | null;
  value?: number | null;
  session_id?: string | null;
  meta?: Record<string, unknown>;
}

async function safeFetch(input: RequestInfo, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(input, init);
  } catch (error) {
    console.warn("[postSignal] network_error", error);
    return null;
  }
}

export async function postSignal(signal: string, payload: SignalPayload): Promise<void> {
  if (!signal) return;
  const interactionId = payload.interaction_id;
  if (!interactionId) {
    console.warn(`[postSignal] missing interaction_id for signal ${signal}`);
    return;
  }

  const body: Record<string, unknown> = {
    signal,
    interaction_id: interactionId,
  };
  if (typeof payload.value === "number") {
    body.value = payload.value;
  }
  if (payload.session_id) {
    body.session_id = payload.session_id;
  }
  if (payload.meta && typeof payload.meta === "object") {
    body.meta = payload.meta;
  }

  await safeFetch("/api/signal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Guest-Id": getOrCreateGuestId(),
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
}
