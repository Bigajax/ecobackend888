import type { NextFunction, Request, Response } from "express";
import cors, { type CorsOptions, type CorsOptionsDelegate } from "cors";

import { log } from "../services/promptContext/logger";

const STATIC_ALLOWLIST = new Set([
  "http://localhost:5173",
  "https://ecofrontend888.vercel.app",
]);

function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true;
  if (STATIC_ALLOWLIST.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

const BASE_OPTIONS: Omit<CorsOptions, "origin"> = {
  credentials: true,
  methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Guest-Id",
    "Accept",
    "Cache-Control",
    "X-Requested-With",
  ],
  exposedHeaders: ["X-Guest-Id"],
  maxAge: 86_400,
};

const delegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin ?? undefined;
  const allowed = isAllowedOrigin(origin);

  if (req.method === "OPTIONS") {
    log.info("[cors] preflight", { origin: origin ?? null, allowed });
  } else if (origin) {
    log.info("[cors] request", { origin, allowed });
  }

  const options: CorsOptions = {
    ...BASE_OPTIONS,
    origin: allowed ? origin : false,
  };

  callback(null, options);
};

const corsInstance = cors(delegate);

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Vary", "Origin");
  corsInstance(req, res, (err) => {
    if (err) {
      log.error("[cors] middleware_error", {
        message: (err as Error).message,
        origin: req.headers.origin ?? null,
      });
      return next(err);
    }

    if (req.method === "OPTIONS" && !res.headersSent) {
      res.sendStatus(204);
      return;
    }

    next();
  });
}

export default corsMiddleware;
