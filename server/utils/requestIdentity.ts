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

export function resolveHeaderOrQuery(
  req: Request,
  headerName: string,
  queryKey: string | string[]
): string {
  const normalizedHeaderName = headerName.toLowerCase();
  const headerBag = req.headers as Record<string, unknown> | undefined;
  if (headerBag) {
    const directHeader = extractStringCandidate(headerBag[headerName]);
    if (directHeader) {
      return directHeader;
    }

    if (headerName !== normalizedHeaderName) {
      const normalizedHeader = extractStringCandidate(headerBag[normalizedHeaderName]);
      if (normalizedHeader) {
        return normalizedHeader;
      }
    }
  }

  const queryBag = req.query as Record<string, unknown> | undefined;
  if (!queryBag) {
    return "";
  }

  const keys = Array.isArray(queryKey) ? queryKey : [queryKey];
  for (const key of keys) {
    const queryCandidate = extractStringCandidate(queryBag[key]);
    if (queryCandidate) {
      return queryCandidate;
    }
  }

  return "";
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

export function readIdentity(req: Request): {
  guestId: string | "";
  sessionId: string | "";
  clientMessageId?: string;
} {
  const guestCandidate = resolveHeaderOrQuery(req, "x-eco-guest-id", ["guest", "guest_id"]);
  const sessionCandidate = resolveHeaderOrQuery(req, "x-eco-session-id", ["session", "session_id"]);
  const clientCandidate = resolveHeaderOrQuery(req, "x-eco-client-message-id", [
    "client_message_id",
    "clientMessageId",
  ]);

  const guestId = isUuidV4(guestCandidate) ? guestCandidate.trim() : "";
  const sessionId = isUuidV4(sessionCandidate) ? sessionCandidate.trim() : "";
  const clientMessageId = isUuidV4(clientCandidate) ? clientCandidate.trim() : undefined;

  return {
    guestId,
    sessionId,
    ...(clientMessageId ? { clientMessageId } : {}),
  };
}

