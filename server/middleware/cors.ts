import type { NextFunction, Request, Response } from "express";

import { log } from "../services/promptContext/logger";

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

function handleCors(req: Request, res: Response) {
  const origin = requestOrigin(req);
  const allowedOrigin = resolveCorsOrigin(origin);
  applyCorsHeaders(res, allowedOrigin);
  return { origin, allowedOrigin };
}

export function applyCorsResponseHeaders(req: Request, res: Response) {
  handleCors(req, res);
}

export function corsResponseInjector(req: Request, res: Response, next: NextFunction) {
  handleCors(req, res);
  next();
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const { origin, allowedOrigin } = handleCors(req, res);
  log.info("CORS middleware ativo", { origin, method: req.method, path: req.path });

  if (req.method === "OPTIONS") {
    if (!allowedOrigin) {
      return res.status(403).end();
    }
    res.status(204);
    return res.end();
  }

  return next();
}

export function getConfiguredCorsOrigins(): string[] {
  return [...CORS_ALLOWED_ORIGINS];
}
