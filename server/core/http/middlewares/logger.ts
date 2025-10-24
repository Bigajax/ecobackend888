import type { Request, Response, NextFunction } from "express";
import { log } from "../../../services/promptContext/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1_000_000;
    const headerGuest = req.get("X-Eco-Guest-Id");
    const guestId =
      typeof req.guestId === "string" && req.guestId.trim()
        ? req.guestId.trim()
        : headerGuest && headerGuest.trim()
        ? headerGuest.trim()
        : null;

    const locals = res.locals as Record<string, unknown>;
    const origin = req.headers.origin ?? null;
    const payload: Record<string, unknown> = {
      path: req.originalUrl,
      method: req.method,
      origin,
      status: res.statusCode,
      preflight: req.method === "OPTIONS",
      sse: Boolean(locals.isSse),
      durationMs: Math.round(durationMs * 1000) / 1000,
      guestId,
    };

    log.info("http.request", payload);
  });

  next();
}
