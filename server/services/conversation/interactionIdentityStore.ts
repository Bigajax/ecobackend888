const DEFAULT_TTL_MS = 10 * 60 * 1000;

const TTL_MS = (() => {
  const raw = process.env.ECO_INTERACTION_GUEST_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
})();

type InteractionGuestEntry = { guestId: string | null; expiresAt: number };

const store = new Map<string, InteractionGuestEntry>();

function prune(now: number = Date.now()): void {
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

export function rememberInteractionGuest(interactionId: string, guestId: string | null): void {
  const trimmed = interactionId?.trim();
  if (!trimmed) return;
  prune();
  store.set(trimmed, { guestId: guestId ?? null, expiresAt: Date.now() + TTL_MS });
}

export function getInteractionGuest(interactionId: string): string | null | undefined {
  const trimmed = interactionId?.trim();
  if (!trimmed) return undefined;
  prune();
  const entry = store.get(trimmed);
  if (!entry) return undefined;
  return entry.guestId ?? null;
}

export function forgetInteractionGuest(interactionId: string): void {
  const trimmed = interactionId?.trim();
  if (!trimmed) return;
  store.delete(trimmed);
}

export function updateInteractionGuest(interactionId: string, guestId: string | null): void {
  const trimmed = interactionId?.trim();
  if (!trimmed) return;
  prune();
  if (!store.has(trimmed)) {
    rememberInteractionGuest(trimmed, guestId);
    return;
  }
  store.set(trimmed, { guestId: guestId ?? null, expiresAt: Date.now() + TTL_MS });
}
