import type { Express, Response, Request, NextFunction } from "express";
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  allowList,
  corsMiddleware,
  isAllowedOrigin,
} from "../../../bootstrap/cors";

export function applyCors(app: Express) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") {
      const origin = req.headers.origin;

      if (isAllowedOrigin(origin)) {
        if (origin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }

      res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS.join(","));
      res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");

      return res.status(204).end();
    }

    next();
  });

  app.use(corsMiddleware);
  app.options("*", corsMiddleware);
}

export function ensureCorsHeaders(res: Response, origin?: string | null) {
  if (isAllowedOrigin(origin) && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export function getAllowList() {
  return allowList;
}
