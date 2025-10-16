import express from "express";
import type { NextFunction, Request, Response } from "express";
import { registrarSignal } from "../controllers/signalController";

const router = express.Router();

const SIGNAL_WINDOW_MS = 5_000;
const SIGNAL_MAX_REQUESTS = 25;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function getKey(req: Request): string {
  const guestId = (req as any)?.guest?.id || req.guestId;
  if (typeof guestId === "string" && guestId.trim()) {
    return `guest:${guestId.trim()}`;
  }
  return `ip:${req.ip}`;
}

function signalRateLimiter(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || req.method === "HEAD") {
    return next();
  }

  const now = Date.now();
  const key = getKey(req);
  const existing = rateBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + SIGNAL_WINDOW_MS });
    return next();
  }

  existing.count += 1;
  if (existing.count > SIGNAL_MAX_REQUESTS) {
    const retryAfter = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
    res.setHeader("Retry-After", retryAfter.toString());
    return res.status(429).json({ code: "RATE_LIMITED" });
  }

  return next();
}

router.use(signalRateLimiter);

router.head("/", (_req, res) => res.status(204).end());
router.post("/", registrarSignal);

export default router;
