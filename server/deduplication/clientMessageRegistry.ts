type ClientMessageStatus = "active" | "completed";

type ClientMessageState = {
  status: ClientMessageStatus;
  expiresAt: number;
};

export type ReservationResult =
  | { ok: true }
  | { ok: false; status: ClientMessageStatus };

export const clientMessageRegistry = new Map<string, ClientMessageState>();

const CLIENT_MESSAGE_ACTIVE_TTL_MS = parseDurationEnv(
  process.env.ECO_CLIENT_MESSAGE_ACTIVE_TTL_MS,
  5 * 60 * 1000
);
const CLIENT_MESSAGE_COMPLETED_TTL_MS = parseDurationEnv(
  process.env.ECO_CLIENT_MESSAGE_COMPLETED_TTL_MS,
  60 * 60 * 1000
);

function parseDurationEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function pruneClientMessageRegistry(now: number = Date.now()): void {
  for (const [key, entry] of clientMessageRegistry.entries()) {
    if (entry.expiresAt <= now) {
      clientMessageRegistry.delete(key);
    }
  }
}

export function reserveClientMessage(key: string): ReservationResult {
  const now = Date.now();
  pruneClientMessageRegistry(now);
  const existing = clientMessageRegistry.get(key);
  if (existing && existing.expiresAt > now) {
    return { ok: false, status: existing.status };
  }
  clientMessageRegistry.set(key, {
    status: "active",
    expiresAt: now + CLIENT_MESSAGE_ACTIVE_TTL_MS,
  });
  return { ok: true };
}

export function markClientMessageCompleted(key: string): void {
  const now = Date.now();
  clientMessageRegistry.set(key, {
    status: "completed",
    expiresAt: now + CLIENT_MESSAGE_COMPLETED_TTL_MS,
  });
}

export function releaseClientMessage(key: string): void {
  clientMessageRegistry.delete(key);
}

export function buildClientMessageKey(
  identity: string | null,
  messageId: string
): string {
  const normalizedIdentity = identity && identity.trim() ? identity.trim() : null;
  const normalizedMessageId = messageId.trim();
  return normalizedIdentity
    ? `${normalizedIdentity}:${normalizedMessageId}`
    : normalizedMessageId;
}
