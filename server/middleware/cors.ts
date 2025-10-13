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

export function getStaticCorsWhitelist(): string[] {
  return Array.from(STATIC_ALLOWLIST);
}

function setVaryHeader(res: Response, value: string) {
  const existing = res.getHeader("Vary");
  if (!existing) {
    res.setHeader("Vary", value);
    return;
  }

  const current = Array.isArray(existing)
    ? existing.map((piece) => piece.split(",").map((v) => v.trim())).flat()
    : String(existing)
        .split(",")
        .map((piece) => piece.trim())
        .filter(Boolean);

  if (!current.includes(value)) {
    res.setHeader("Vary", [...current, value].join(", "));
  }
}

function applyStaticHeaders(res: Response) {
  if (BASE_OPTIONS.methods) {
    const methods = Array.isArray(BASE_OPTIONS.methods)
      ? BASE_OPTIONS.methods.join(", ")
      : String(BASE_OPTIONS.methods);
    res.setHeader("Access-Control-Allow-Methods", methods);
  }
  if (BASE_OPTIONS.allowedHeaders) {
    res.setHeader(
      "Access-Control-Allow-Headers",
      Array.isArray(BASE_OPTIONS.allowedHeaders)
        ? BASE_OPTIONS.allowedHeaders.join(", ")
        : String(BASE_OPTIONS.allowedHeaders)
    );
  }
  if (BASE_OPTIONS.exposedHeaders) {
    res.setHeader(
      "Access-Control-Expose-Headers",
      Array.isArray(BASE_OPTIONS.exposedHeaders)
        ? BASE_OPTIONS.exposedHeaders.join(", ")
        : String(BASE_OPTIONS.exposedHeaders)
    );
  }
  if (BASE_OPTIONS.maxAge) {
    res.setHeader("Access-Control-Max-Age", String(BASE_OPTIONS.maxAge));
  }

  if (BASE_OPTIONS.credentials) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export function ensureCorsHeaders(res: Response, origin?: string | null) {
  setVaryHeader(res, "Origin");
  applyStaticHeaders(res);

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  setVaryHeader(res, "Origin");
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
