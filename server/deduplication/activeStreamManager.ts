const ACTIVE_INTERACTION_TTL_MS = parseDurationEnv(
  process.env.ECO_ACTIVE_INTERACTION_TTL_MS,
  10 * 60 * 1000
);

type ActiveStreamSession = {
  controller: AbortController;
  interactionId: string;
};

type ActiveInteractionState = {
  controller: AbortController;
  startedAt: number;
};

export const activeStreamSessions = new Map<string, ActiveStreamSession>();
export const activeInteractions = new Map<string, ActiveInteractionState>();

function parseDurationEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function pruneActiveInteractions(now: number = Date.now()): void {
  for (const [key, entry] of activeInteractions.entries()) {
    const isExpired = entry.startedAt + ACTIVE_INTERACTION_TTL_MS <= now;
    if (isExpired || entry.controller.signal.aborted) {
      activeInteractions.delete(key);
    }
  }
}

export function reserveActiveInteraction(
  key: string,
  controller: AbortController
): boolean {
  const normalized = key.trim();
  if (!normalized) {
    return true;
  }
  pruneActiveInteractions();
  const existing = activeInteractions.get(normalized);
  if (existing) {
    if (existing.controller === controller) {
      return true;
    }
    if (existing.controller.signal.aborted) {
      activeInteractions.delete(normalized);
    } else {
      return false;
    }
  }
  activeInteractions.set(normalized, {
    controller,
    startedAt: Date.now(),
  });
  return true;
}

export function releaseActiveInteraction(
  key: string,
  controller: AbortController
): void {
  const normalized = key.trim();
  if (!normalized) {
    return;
  }
  const existing = activeInteractions.get(normalized);
  if (!existing) {
    return;
  }
  if (existing.controller === controller) {
    activeInteractions.delete(normalized);
  }
}

export function buildActiveInteractionKey(
  type: "client" | "interaction",
  value: string
): string {
  return `${type}:${value.trim()}`;
}
