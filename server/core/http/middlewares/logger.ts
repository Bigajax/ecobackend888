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
    };

    if (req.method === "OPTIONS") {
      payload.preflight = true;
    }

    log.info("http.request", payload);
  });

  next();
}
