import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

import { log } from "../../services/promptContext/logger";

declare global {
  namespace Express {
    interface Request {
      guestId?: string;
    }
  }
}

const COOKIE_NAME = "guest_id";
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
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
  res.setHeader("X-Guest-Id", id);
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

function normalizeGuestId(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  if (!trimmed) return undefined;
  if (!UUID_V4.test(trimmed)) return undefined;
  return trimmed;
}

export function ensureGuestIdentity(req: Request, res: Response, next: NextFunction) {
  if ((req as any).user?.id) {
    return next();
  }

  const headerCandidate =
    getHeaderValue(req.headers["x-eco-guest-id"]) ?? getHeaderValue(req.headers["x-guest-id"]);
  const cookieCandidate = readGuestIdFromCookies(req);

  let guestId = normalizeGuestId(headerCandidate) ?? normalizeGuestId(cookieCandidate);

  if (!guestId) {
    if (headerCandidate || cookieCandidate) {
      log.warn("[guestIdentity] invalid guest identifier", {
        header: headerCandidate ?? null,
        fromCookie: Boolean(cookieCandidate),
        path: req.path,
      });
    } else {
      log.warn("[guestIdentity] missing guest identifier", { path: req.path });
    }

    guestId = randomUUID();
    log.info("[guestIdentity] generated new guest ID", { id: guestId });
  }

  req.guestId = guestId;
  (req.headers as Record<string, string>)["x-guest-id"] = guestId;
  (req.headers as Record<string, string>)["x-eco-guest-id"] = guestId;

  mirrorGuestId(res, guestId);

  next();
}
