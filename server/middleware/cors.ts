import type { NextFunction, Request, Response } from "express";
import cors, { type CorsOptions, type CorsOptionsDelegate } from "cors";

import { log } from "../services/promptContext/logger";

const STATIC_WHITELIST = [
  "https://ecofrontend888.vercel.app",
  "http://localhost:5173",
] as const;

const STATIC_WHITELIST_SET = new Set<string>(STATIC_WHITELIST);

export const ALLOWED_METHODS = ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"] as const;
export const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Guest-Id",
  "X-Requested-With",
  "Accept",
  "Cache-Control",
] as const;
export const EXPOSED_HEADERS = ["Content-Type"] as const;

export const ALLOWED_METHODS_HEADER = ALLOWED_METHODS.join(", ");
export const ALLOWED_HEADERS_HEADER = ALLOWED_HEADERS.join(", ");
export const EXPOSED_HEADERS_HEADER = EXPOSED_HEADERS.join(", ");
export const PREFLIGHT_MAX_AGE_SECONDS = 86_400;

function isVercelPreview(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (!url.protocol.startsWith("http")) {
      return false;
    }
    return url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export function resolveAllowedOrigin(origin?: string | null): string | null {
  if (!origin) {
    return null;
  }
  const trimmed = origin.trim();
  if (!trimmed) {
    return null;
  }
  if (STATIC_WHITELIST_SET.has(trimmed)) {
    return trimmed;
  }
  if (isVercelPreview(trimmed)) {
    return trimmed;
  }
  return null;
}

export function isAllowedOrigin(origin?: string | null): boolean {
  return resolveAllowedOrigin(origin) !== null;
}

const baseOptions: Omit<CorsOptions, "origin"> = {
  credentials: true,
  methods: [...ALLOWED_METHODS],
  allowedHeaders: [...ALLOWED_HEADERS],
  exposedHeaders: [...EXPOSED_HEADERS],
  maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  optionsSuccessStatus: 204,
};

const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin ?? undefined;
  const allowedOrigin = resolveAllowedOrigin(origin) ?? undefined;

  const payload = {
    method: req.method,
    origin: origin ?? null,
    allowedOrigin: allowedOrigin ?? null,
    path: req.originalUrl ?? req.url,
  };

  if (req.method === "OPTIONS") {
    log.info("http.cors.preflight", payload);
  } else {
    log.info("http.cors.request", payload);
  }

  const options: CorsOptions = {
    ...baseOptions,
    origin: true,
  };

  if (!origin) {
    options.origin = true;
  } else if (allowedOrigin) {
    options.origin = allowedOrigin;
  } else {
    options.origin = false;
  }

  return callback(null, options);
};

const baseCors = cors(corsDelegate);

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Vary", "Origin");
  baseCors(req, res, next);
}

export function ensureCorsHeaders(res: Response, origin?: string | null): void {
  const allowedOrigin = resolveAllowedOrigin(origin);
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS_HEADER);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS_HEADER);
  res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS_HEADER);
  res.setHeader("Access-Control-Max-Age", `${PREFLIGHT_MAX_AGE_SECONDS}`);
  res.setHeader("Vary", "Origin");
}

export function getStaticCorsWhitelist(): string[] {
  return Array.from(STATIC_WHITELIST_SET);
}
