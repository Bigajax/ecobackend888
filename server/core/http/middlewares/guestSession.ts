import { type NextFunction, type Request, type Response } from "express";

import { normalizeGuestIdentifier } from "../guestIdentity";
import { log } from "../../../services/promptContext/logger";

const DEFAULT_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const guestInteractions = new Map<string, { count: number; updatedAt: number }>();
const blockedGuests = new Set<string>();

const normalizeGuestKey = (guestId: string): string => {
  const normalized = normalizeGuestIdentifier(guestId);
  if (normalized) return normalized;
  return guestId.trim();
};

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseRateLimit = (raw: string | undefined): RateLimitConfig => {
  if (!raw) return { ...DEFAULT_RATE_LIMIT };

  const normalized = raw.trim();
  const match = normalized.match(/^([0-9]+)\s*\/\s*(?:(\d+)\s*)?([smhd])$/i);
  if (match) {
    const amount = Number.parseInt(match[1], 10);
    const windowCount = match[2] ? Number.parseInt(match[2], 10) : 1;
    const unit = match[3].toLowerCase();
    const unitMs = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
    const limit = Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_RATE_LIMIT.limit;
    const windowMultiplier = Number.isFinite(windowCount) && windowCount > 0 ? windowCount : 1;
    const windowMs = unitMs * windowMultiplier;
    return { limit, windowMs };
  }

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric) && numeric > 0) {
    return { limit: numeric, windowMs: DEFAULT_RATE_LIMIT.windowMs };
  }

  return { ...DEFAULT_RATE_LIMIT };
};

const rateLimitConfig = parseRateLimit(process.env.GUEST_RATE_LIMIT);
const guestMaxInteractions = toNumber(process.env.GUEST_MAX_INTERACTIONS, 6);

const cleanupExpiredBucket = (key: string, now: number) => {
  const bucket = rateBuckets.get(key);
  if (!bucket) return;
  if (bucket.resetAt <= now) {
    rateBuckets.delete(key);
  }
};

const touchRateBucket = (key: string): { count: number; resetAt: number } => {
  const now = Date.now();
  cleanupExpiredBucket(key, now);
  const existing = rateBuckets.get(key);
  if (!existing) {
    const fresh = { count: 1, resetAt: now + rateLimitConfig.windowMs };
    rateBuckets.set(key, fresh);
    return fresh;
  }
  existing.count += 1;
  return existing;
};

const getHeaderString = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
};

const isTruthyHeader = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

export const getGuestInteractionCount = (guestId: string): number => {
  const key = normalizeGuestKey(guestId);
  const entry = guestInteractions.get(key);
  return entry?.count ?? 0;
};

export const incrementGuestInteraction = (guestId: string): number => {
  const now = Date.now();
  const key = normalizeGuestKey(guestId);
  const entry = guestInteractions.get(key);
  if (!entry) {
    const initial = { count: 1, updatedAt: now };
    guestInteractions.set(key, initial);
    return initial.count;
  }
  entry.count += 1;
  entry.updatedAt = now;
  return entry.count;
};

export const resetGuestInteraction = (guestId: string): void => {
  const key = normalizeGuestKey(guestId);
  guestInteractions.delete(key);
};

export const blockGuestId = (guestId: string): void => {
  if (guestId) {
    blockedGuests.add(normalizeGuestKey(guestId));
  }
};

const getClientIp = (req: Request): string => {
  const forwarded = getHeaderString(req.headers["x-forwarded-for"]);
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || req.ip || "unknown";
  }
  return req.ip || "unknown";
};

export interface GuestSessionMeta {
  id: string;
  ip: string;
  interactionsUsed: number;
  maxInteractions: number;
  rateLimit: { limit: number; remaining: number; resetAt: number };
}

declare global {
  namespace Express {
    interface Request {
      guest?: GuestSessionMeta;
    }
  }
}

export function guestSessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = getHeaderString(req.headers.authorization);
  if (authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const guestModeHeader = getHeaderString(req.headers["x-guest-mode"]);
  if (!isTruthyHeader(guestModeHeader)) {
    return next();
  }

  const candidate =
    typeof req.guestId === "string"
      ? req.guestId
      : getHeaderString(req.headers["x-eco-guest-id"]);
  const guestId = normalizeGuestIdentifier(candidate);

  if (!guestId) {
    log.warn("[guest-session] missing guest id for guest-mode request", { path: req.path });
    return next();
  }

  const guestKey = normalizeGuestKey(guestId);

  if (blockedGuests.has(guestKey)) {
    return res.status(403).json({ error: "Guest ID bloqueado." });
  }

  const ip = getClientIp(req);
  const rateKey = `${ip}:${guestKey}`;
  const bucket = touchRateBucket(rateKey);
  if (bucket.count > rateLimitConfig.limit) {
    return res.status(429).json({ code: "RATE_LIMITED" });
  }

  const interactionsUsed = getGuestInteractionCount(guestKey);
  req.guest = {
    id: guestKey,
    ip,
    interactionsUsed,
    maxInteractions: guestMaxInteractions,
    rateLimit: {
      limit: rateLimitConfig.limit,
      remaining: Math.max(rateLimitConfig.limit - bucket.count, 0),
      resetAt: bucket.resetAt,
    },
  };

  res.setHeader("X-Eco-Guest-Id", guestKey);

  return next();
}

export const guestSessionConfig = {
  get maxInteractions() {
    return guestMaxInteractions;
  },
  get rateLimit() {
    return { ...rateLimitConfig };
  },
};

