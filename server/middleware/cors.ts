import cors from "cors";
import type { NextFunction, Request, Response } from "express";

export const CORS_ALLOWED_ORIGINS = [
  "https://ecofrontend888.vercel.app",
  "http://localhost:5173",
] as const;

export const PRIMARY_CORS_ORIGIN = CORS_ALLOWED_ORIGINS[0];

export const CORS_ALLOWED_METHODS = ["GET", "POST", "OPTIONS"] as const;
export const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "x-client-id",
  "x-eco-guest-id",
  "x-eco-session-id",
] as const;

export const CORS_ALLOWED_METHODS_VALUE = CORS_ALLOWED_METHODS.join(",");
export const CORS_ALLOWED_HEADERS_VALUE = CORS_ALLOWED_HEADERS.join(",");

function requestOrigin(req: Request): string | null {
  return typeof req.headers.origin === "string" ? req.headers.origin : null;
}

export function resolveCorsOrigin(origin?: string | null): string | null {
  if (!origin) return null;
  return CORS_ALLOWED_ORIGINS.some((allowed) => allowed === origin) ? origin : null;
}

export function isAllowedOrigin(origin?: string | null): boolean {
  return resolveCorsOrigin(origin) !== null;
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (resolveCorsOrigin(origin)) {
      return callback(null, origin);
    }
    return callback(null, false);
  },
  methods: [...CORS_ALLOWED_METHODS],
  allowedHeaders: [...CORS_ALLOWED_HEADERS],
  credentials: false,
  optionsSuccessStatus: 204,
});

function applyCorsHeaders(res: Response, origin: string | null) {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.removeHeader("Access-Control-Allow-Origin");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS_VALUE);
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS_VALUE);
}

export function applyCorsResponseHeaders(req: Request, res: Response) {
  const origin = requestOrigin(req);
  const allowedOrigin = resolveCorsOrigin(origin);
  const headerOrigin = allowedOrigin ?? (origin ? null : PRIMARY_CORS_ORIGIN);
  applyCorsHeaders(res, headerOrigin);
}

export function corsResponseInjector(req: Request, res: Response, next: NextFunction) {
  applyCorsResponseHeaders(req, res);
  next();
}

export function getConfiguredCorsOrigins(): string[] {
  return [...CORS_ALLOWED_ORIGINS];
}
