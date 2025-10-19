import type { Request, Response, NextFunction } from "express";
import { log } from "../../../services/promptContext/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const locals = res.locals as Record<string, unknown>;
    const origin = req.headers.origin ?? null;
    const payload: Record<string, unknown> = {
      path: req.originalUrl,
      method: req.method,
      origin,
      status: res.statusCode,
      preflight: req.method === "OPTIONS",
      sse: Boolean(locals.isSse),
    };

    log.info("http.request", payload);
  });

  next();
}
