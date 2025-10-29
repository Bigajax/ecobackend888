import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

import { log } from "../../services/promptContext/logger";

const COOKIE_NAME = "guest_id";
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GUEST_ID_REQUIRED_PATHS: RegExp[] = [
  /^\/api\/ask-eco(?:\/|$)/i,
  /^\/api\/signal(?:\/|$)/i,
  /^\/api\/health(?:\/|$)/i,
];

function stripGuestPrefix(value: string): string {
  if (/^guest_/i.test(value)) {
    return value.replace(/^guest_/i, "");
  }
  return value;
}

export function normalizeGuestIdentifier(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  if (!trimmed) return undefined;
  const withoutPrefix = stripGuestPrefix(trimmed);
  if (!UUID_V4.test(withoutPrefix)) return undefined;
  return withoutPrefix;
}

declare global {
  namespace Express {
    interface Request {
      guestId?: string;
      sessionId?: string;
      ecoSessionId?: string;
    }
  }
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const resolved = getQueryValue(value[index]);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

function readQueryParam(req: Request, keys: string[]): string | undefined {
  const queryBag = req.query as Record<string, unknown> | undefined;
  if (!queryBag) return undefined;
  for (const key of keys) {
    const candidate = getQueryValue(queryBag[key]);
    if (candidate) return candidate;
  }
  return undefined;
}

function readGuestIdFromCookies(req: Request): string | undefined {
  const cookieBag = (req as any).cookies as Record<string, string> | undefined;
  if (cookieBag && typeof cookieBag[COOKIE_NAME] === "string") {
    const candidate = cookieBag[COOKIE_NAME].trim();
    if (candidate) return candidate;
  }

  const rawCookie = req.headers.cookie;
  if (!rawCookie) return undefined;

  for (const piece of rawCookie.split(";")) {
    const [key, ...rest] = piece.split("=");
    if (!key || key.trim() !== COOKIE_NAME) continue;
    try {
      const decoded = decodeURIComponent(rest.join("=") ?? "");
      const trimmed = decoded.trim();
      if (trimmed) {
        return trimmed;
      }
    } catch {
      log.warn("[guestIdentity] failed to decode guest cookie", { path: req.path });
    }
  }

  return undefined;
}

function mirrorGuestId(res: Response, id: string) {
  res.setHeader("X-Eco-Guest-Id", id);
  if (typeof res.cookie === "function") {
    res.cookie(COOKIE_NAME, id, {
      httpOnly: false,
      sameSite: "none",
      secure: true,
      path: "/",
    });
  } else {
    const cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; Path=/; Secure; SameSite=None`;
    const existing = res.getHeader("Set-Cookie");
    if (!existing) {
      res.setHeader("Set-Cookie", cookie);
    } else if (Array.isArray(existing)) {
      res.setHeader("Set-Cookie", [...existing, cookie]);
    } else {
      res.setHeader("Set-Cookie", [existing as string, cookie]);
    }
  }
}

function normalizeSessionId(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 256) {
    return trimmed.slice(0, 256);
  }
  return trimmed;
}

function ensureSessionHeader(req: Request, res: Response) {
  const headerCandidate = getHeaderValue(req.headers["x-eco-session-id"]);
  const queryCandidate = readQueryParam(req, ["session_id", "sessionId", "session"]);

  let sessionId = normalizeSessionId(headerCandidate);
  let source: "header" | "query" | "generated" = "header";

  if (!sessionId) {
    const normalizedQuery = normalizeSessionId(queryCandidate);
    if (normalizedQuery) {
      sessionId = normalizedQuery;
      source = "query";
    }
  }

  if (!sessionId) {
    sessionId = randomUUID();
    source = "generated";
    log.info("[guestIdentity] generated new session ID", { id: sessionId, path: req.path });
  }

  req.sessionId = sessionId;
  req.ecoSessionId = sessionId;
  (req.headers as Record<string, string>)["x-eco-session-id"] = sessionId;
  res.setHeader("X-Eco-Session-Id", sessionId);
  return { sessionId, generated: source === "generated", source };
}

export function ensureGuestIdentity(req: Request, res: Response, next: NextFunction) {
  const { sessionId, source: sessionSource } = ensureSessionHeader(req, res);

  if ((req as any).user?.id) {
    return next();
  }

  const headerCandidate = getHeaderValue(req.headers["x-eco-guest-id"]);
  const queryCandidate = readQueryParam(req, ["guest_id", "guestId", "guest"]);
  const cookieCandidate = readGuestIdFromCookies(req);

  const requiresGuestId = GUEST_ID_REQUIRED_PATHS.some((pattern) => pattern.test(req.path));

  const normalizedHeader = normalizeGuestIdentifier(headerCandidate);
  const normalizedQuery = normalizeGuestIdentifier(queryCandidate);
  const normalizedCookie = normalizeGuestIdentifier(cookieCandidate);
  const invalidHeader = Boolean(headerCandidate) && !normalizedHeader;
  const invalidQuery = Boolean(queryCandidate) && !normalizedQuery;
  const invalidCookie = Boolean(cookieCandidate) && !normalizedCookie;
  let guestId = normalizedHeader ?? normalizedQuery ?? normalizedCookie;

  if (!guestId) {
    if (invalidHeader || invalidQuery || invalidCookie) {
      log.warn("[guestIdentity] invalid guest identifier", {
        header: headerCandidate ?? null,
        query: queryCandidate ?? null,
        fromCookie: Boolean(cookieCandidate),
        path: req.path,
      });
      if (requiresGuestId) {
        return res
          .status(400)
          .json({ error: "invalid_guest_id", message: "Envie um UUID v4 em X-Eco-Guest-Id" });
      }
    } else {
      log.info("[guestIdentity] missing guest identifier", { path: req.path });
    }

    guestId = randomUUID();
    log.info("[guestIdentity] generated new guest ID", { id: guestId, path: req.path });
  }

  req.guestId = guestId;
  (req.headers as Record<string, string>)["x-eco-guest-id"] = guestId;

  mirrorGuestId(res, guestId);

  if (req.path.startsWith("/api/ask-eco")) {
    const guestSource = normalizedHeader
      ? "header"
      : normalizedQuery
        ? "query"
        : normalizedCookie
          ? "cookie"
          : "generated";
    log.info("[guestIdentity] resolved", {
      guestId,
      sessionId,
      source: guestSource,
      sessionSource,
      path: req.path,
    });
  }

  next();
}
