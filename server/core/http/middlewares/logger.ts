import type { Request, Response, NextFunction } from "express";
import { log } from "../../../services/promptContext/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    log.info("http.request", {
      method: req.method,
      path: req.originalUrl,
      origin: req.headers.origin ?? null,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: (req as any).user?.id ?? null,
      guestId: req.guest?.id ?? req.guestId ?? null,
    });
  });

  next();
}
