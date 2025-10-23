import { getGuestIdHeader, rememberGuestIdFromResponse } from "../utils/guest";
import { getSessionIdHeader, rememberSessionIdFromResponse } from "../utils/session";

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
  const interactionId = payload.interaction_id?.trim() || null;
  const body: Record<string, unknown> = {
    signal,
  };
  if (interactionId) {
    body.interaction_id = interactionId;
  }
  if (typeof payload.value === "number") {
    body.value = payload.value;
  }
  if (payload.session_id) {
    body.session_id = payload.session_id;
  }
  if (payload.meta && typeof payload.meta === "object") {
    body.meta = payload.meta;
  }

  const guestId = getGuestIdHeader();
  const sessionId = getSessionIdHeader();
  const response = await safeFetch("/api/signal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(guestId ? { "X-Eco-Guest-Id": guestId } : {}),
      ...(sessionId ? { "X-Eco-Session-Id": sessionId } : {}),
      ...(interactionId ? { "X-Eco-Interaction-Id": interactionId } : {}),
    },
    body: JSON.stringify(body),
    credentials: "include",
  });

  if (response) {
    rememberGuestIdFromResponse(response);
    rememberSessionIdFromResponse(response);
  }
}
