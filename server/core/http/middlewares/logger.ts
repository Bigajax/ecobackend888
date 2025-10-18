import type { Request, Response, NextFunction } from "express";
import { log } from "../../../services/promptContext/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const locals = res.locals as Record<string, unknown>;
    const origin = req.headers.origin ?? null;
    const allowed =
      typeof locals.corsAllowed === "boolean"
        ? (locals.corsAllowed as boolean)
        : origin
        ? false
        : true;

    const payload: Record<string, unknown> = {
      path: req.originalUrl,
      method: req.method,
      origin,
      allowed,
      status: res.statusCode,
      redirected: res.statusCode >= 300 && res.statusCode < 400,
    };

    payload.preflight = req.method === "OPTIONS";
    payload.sse = Boolean(locals.isSse);

    log.info("http.request", payload);
  });

  next();
}
