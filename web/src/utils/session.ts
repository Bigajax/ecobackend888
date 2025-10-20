const STORAGE_KEY = "eco_session_id";

function safeGetSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeSessionId(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 256);
}

function storeSessionId(id: string): void {
  const storage = safeGetSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore storage quota errors
  }
}

export function getStoredSessionId(): string | null {
  const storage = safeGetSessionStorage();
  if (!storage) return null;
  const fromStorage = storage.getItem(STORAGE_KEY);
  return normalizeSessionId(fromStorage);
}

export function rememberSessionId(id: string | null | undefined): string | null {
  const normalized = normalizeSessionId(id);
  if (!normalized) {
    return null;
  }
  storeSessionId(normalized);
  return normalized;
}

export function rememberSessionIdFromResponse(response: Response | null | undefined): string | null {
  if (!response || typeof response.headers?.get !== "function") {
    return null;
  }
  const headerValue = response.headers.get("x-eco-session-id");
  return rememberSessionId(headerValue ?? undefined);
}

export function getSessionIdHeader(): string | undefined {
  return getStoredSessionId() ?? undefined;
}
