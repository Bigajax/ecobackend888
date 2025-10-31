import type { Request } from "express";

export function extractStringCandidate(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const resolved = extractStringCandidate(value[index]);
      if (resolved) {
        return resolved;
      }
    }
  }

  return undefined;
}

function normalizeDuplicateIdentityValue(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!trimmed.includes(",")) {
    return trimmed;
  }
  const pieces = trimmed
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (!pieces.length) {
    return undefined;
  }
  const first = pieces[0];
  const allSame = pieces.every((piece) => piece.toLowerCase() === first.toLowerCase());
  return allSame ? first : trimmed;
}

const UUID_V4_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return UUID_V4_RX.test(trimmed);
}

type IdentitySource = "header" | "query";

type IdentityComponent = {
  candidate: string | "";
  value: string | "";
  source: IdentitySource | null;
  valid: boolean;
};

function resolveIdentityComponent(
  req: Request,
  headerName: string,
  queryKey: string | string[]
): IdentityComponent {
  const normalizedHeaderName = headerName.toLowerCase();
  const headerBag = req.headers as Record<string, unknown> | undefined;
  let candidate = "";
  let source: IdentitySource | null = null;

  const resolveCandidate = (raw: unknown): string | undefined =>
    normalizeDuplicateIdentityValue(extractStringCandidate(raw));

  if (headerBag) {
    const directHeader = resolveCandidate(headerBag[headerName]);
    if (directHeader) {
      candidate = directHeader;
      source = "header";
    } else if (headerName !== normalizedHeaderName) {
      const normalizedHeader = resolveCandidate(headerBag[normalizedHeaderName]);
      if (normalizedHeader) {
        candidate = normalizedHeader;
        source = "header";
      }
    }
  }

  if (!candidate) {
    const queryBag = req.query as Record<string, unknown> | undefined;
    if (queryBag) {
      const keys = Array.isArray(queryKey) ? queryKey : [queryKey];
      for (const key of keys) {
        const queryCandidate = resolveCandidate(queryBag[key]);
        if (queryCandidate) {
          candidate = queryCandidate;
          source = "query";
          break;
        }
      }
    }
  }

  const valid = candidate ? isUuidV4(candidate) : false;
  const value = valid ? candidate.trim() : "";

  return {
    candidate: candidate ? candidate.trim() : "",
    value,
    source,
    valid,
  };
}

export type IdentitySnapshot = {
  guestId: string | "";
  sessionId: string | "";
  clientMessageId?: string;
  meta: {
    guest: IdentityComponent;
    session: IdentityComponent;
    client: IdentityComponent;
  };
};

export function readIdentity(req: Request): IdentitySnapshot {
  const guest = resolveIdentityComponent(req, "x-eco-guest-id", ["guest", "guest_id"]);
  const session = resolveIdentityComponent(req, "x-eco-session-id", ["session", "session_id"]);
  const client = resolveIdentityComponent(req, "x-eco-client-message-id", [
    "client_message_id",
    "clientMessageId",
  ]);

  const snapshot: IdentitySnapshot = {
    guestId: guest.value,
    sessionId: session.value,
    ...(client.valid ? { clientMessageId: client.value } : {}),
    meta: {
      guest,
      session,
      client,
    },
  };

  return snapshot;
}

