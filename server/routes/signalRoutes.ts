import express from "express";
import type { NextFunction, Request, Response } from "express";
import { registrarSignal } from "../controllers/signalController";
import { applyCorsResponseHeaders } from "../middleware/cors";
import { log } from "../services/promptContext/logger";

const router = express.Router();

const SIGNAL_WINDOW_MS = 1_000;
const SIGNAL_MAX_REQUESTS = 10;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

const limiterLogger = log.withContext("signal-rate-limit");

function normalizeHeader(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getLimiterKey(req: Request): string {
  const headerGuest = normalizeHeader(req.get("X-Eco-Guest-Id"));
  if (headerGuest) {
    return `guest:${headerGuest}`;
  }
  return `ip:${req.ip}`;
}

function signalRateLimiter(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") {
    return next();
  }

  const now = Date.now();
  const key = getLimiterKey(req);
  const existing = rateBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + SIGNAL_WINDOW_MS });
    return next();
  }

  existing.count += 1;
  if (existing.count > SIGNAL_MAX_REQUESTS) {
    applyCorsResponseHeaders(req, res);
    limiterLogger.warn("signal.rate_limited", { key, count: existing.count });
    return res.status(204).end();
  }

  return next();
}

router.use(signalRateLimiter);

router.options("/", (_req, res) => res.status(204).end());
router.post("/", registrarSignal);

export default router;
