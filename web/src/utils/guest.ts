const STORAGE_KEY = "eco_guest_id";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeGetLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeGuestId(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (!UUID_V4.test(trimmed)) return null;
  return trimmed;
}

function storeGuestId(id: string): void {
  const storage = safeGetLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore storage quota errors
  }
}

export function getStoredGuestId(): string | null {
  const storage = safeGetLocalStorage();
  if (!storage) return null;
  const fromStorage = storage.getItem(STORAGE_KEY);
  return normalizeGuestId(fromStorage);
}

export function rememberGuestId(id: string | null | undefined): string | null {
  const normalized = normalizeGuestId(id);
  if (!normalized) {
    return null;
  }
  storeGuestId(normalized);
  return normalized;
}

export function rememberGuestIdFromResponse(response: Response | null | undefined): string | null {
  if (!response || typeof response.headers?.get !== "function") {
    return null;
  }
  const headerValue = response.headers.get("x-eco-guest-id");
  return rememberGuestId(headerValue ?? undefined);
}

export function getGuestIdHeader(): string | undefined {
  return getStoredGuestId() ?? undefined;
}

// Backwards compatibility for legacy callers expecting a string.
export function getOrCreateGuestId(): string {
  return getGuestIdHeader() ?? "";
}
