import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { log } from "../../services/promptContext/logger";

declare module "express-serve-static-core" {
  interface Request {
    guestId?: string;
  }
}

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GUEST_ID_PREFIX = "guest_";
const GUEST_COOKIE_NAME = "guest_id";

const GUEST_PREFIX_CANDIDATES = ["guest_", "guest:", "guest-"];

export const createGuestId = (): string => `${GUEST_ID_PREFIX}${randomUUID()}`;

export const sanitizeGuestId = (raw: string | undefined | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();

  if (UUID_V4_REGEX.test(lowered)) {
    return `${GUEST_ID_PREFIX}${lowered}`;
  }

  for (const prefix of GUEST_PREFIX_CANDIDATES) {
    if (lowered.startsWith(prefix)) {
      const candidate = lowered.slice(prefix.length);
      if (UUID_V4_REGEX.test(candidate)) {
        return `${GUEST_ID_PREFIX}${candidate}`;
      }
    }
  }

  return null;
};

const getHeaderString = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
};

const readGuestIdFromCookie = (req: Request): string | null => {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return null;

  for (const piece of rawCookie.split(";")) {
    const [rawKey, ...rest] = piece.split("=");
    if (!rawKey) continue;
    if (rawKey.trim() !== GUEST_COOKIE_NAME) continue;

    const value = rest.join("=");
    try {
      const decoded = decodeURIComponent(value ?? "");
      const sanitized = sanitizeGuestId(decoded);
      if (sanitized) return sanitized;
    } catch {
      log.warn("[guest-identity] erro ao decodificar guest_id do cookie", {
        path: req.path,
      });
    }
  }

  return null;
};

const appendSetCookie = (res: Response, cookie: string) => {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookie]);
    return;
  }

  res.setHeader("Set-Cookie", [existing as string, cookie]);
};

const setGuestCookie = (res: Response, guestId: string) => {
  const encoded = encodeURIComponent(guestId);
  const cookie = `${GUEST_COOKIE_NAME}=${encoded}; Path=/; Secure; SameSite=None`;
  appendSetCookie(res, cookie);
};

export const ensureGuestIdentity = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = getHeaderString(req.headers.authorization);
  const hasBearerAuth = Boolean(authHeader && /^Bearer\s+/i.test(authHeader.trim()));

  const rawHeader = getHeaderString(req.headers["x-guest-id"]);
  const sanitizedHeader = sanitizeGuestId(rawHeader ?? undefined);
  const cookieGuestId = readGuestIdFromCookie(req);

  let guestId = sanitizedHeader ?? cookieGuestId;

  if (!sanitizedHeader && rawHeader?.trim()) {
    log.warn("[guest-identity] header inválido recebido", {
      header: rawHeader,
      path: req.path,
      method: req.method,
    });
  }

  if (!guestId) {
    if (hasBearerAuth) {
      return next();
    }

    guestId = createGuestId();
    log.warn("[guest-identity] gerando guest_id", {
      reason: rawHeader ? "invalid" : "missing",
      path: req.path,
      method: req.method,
    });
  } else if (!sanitizedHeader && !hasBearerAuth) {
    // Header ausente mas cookie presente → reaplica header/cookie para o cliente aprender.
    if (!rawHeader) {
      log.warn("[guest-identity] header ausente, reutilizando cookie existente", {
        path: req.path,
        method: req.method,
      });
    }
  }

  if (guestId) {
    req.guestId = guestId;
    (req.headers as Record<string, string>)["x-guest-id"] = guestId;
    res.setHeader("X-Guest-Id", guestId);

    setGuestCookie(res, guestId);
  }

  return next();
};

