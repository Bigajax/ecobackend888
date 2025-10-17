const STORAGE_KEY = "eco_guest_id";

function safeGetLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getOrCreateGuestId(): string {
  const storage = safeGetLocalStorage();
  if (!storage) {
    return "";
  }
  let id = storage.getItem(STORAGE_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    try {
      storage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage quota errors
    }
  }
  return id;
}
