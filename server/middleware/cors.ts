import cors from "cors";
import type { NextFunction, Request, Response } from "express";

const DEFAULT_CORS_ALLOWLIST =
  "https://ecofrontend888.vercel.app,https://ecofrontend888-*.vercel.app,http://localhost:5173,http://localhost:4173";

const FALLBACK_ORIGINS = DEFAULT_CORS_ALLOWLIST.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const rawAllowlist = process.env.CORS_ALLOWLIST;

export const CORS_ALLOWED_ORIGINS = (() => {
  if (typeof rawAllowlist === "string" && rawAllowlist.trim().length > 0) {
    const parsed = rawAllowlist
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return FALLBACK_ORIGINS;
})();

export const PRIMARY_CORS_ORIGIN = CORS_ALLOWED_ORIGINS[0];

export const CORS_ALLOWED_METHODS = ["GET", "POST", "OPTIONS"] as const;
export const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "x-client-id",
  "x-eco-guest-id",
  "x-eco-session-id",
  "x-eco-client-message-id",
] as const;

export const CORS_ALLOWED_METHODS_VALUE = CORS_ALLOWED_METHODS.join(",");
export const CORS_ALLOWED_HEADERS_VALUE = CORS_ALLOWED_HEADERS.join(",");

function requestOrigin(req: Request): string | null {
  return typeof req.headers.origin === "string" ? req.headers.origin : null;
}

const wildcardPlaceholder = "__WILDCARD__";

function wildcardPatternToRegExp(pattern: string): RegExp {
  const placeholderPattern = pattern.replace(/\*/g, wildcardPlaceholder);
  const escapedPattern = placeholderPattern.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
  const regexSource = `^${escapedPattern.replace(new RegExp(wildcardPlaceholder, "g"), ".*")}$`;
  return new RegExp(regexSource);
}

const CORS_ALLOWED_PATTERNS = CORS_ALLOWED_ORIGINS.map(wildcardPatternToRegExp);

export function matchesAllowedOrigin(origin: string): boolean {
  return CORS_ALLOWED_PATTERNS.some((regex) => regex.test(origin));
}

export function resolveCorsOrigin(origin?: string | null): string | null {
  if (!origin) return null;
  return matchesAllowedOrigin(origin) ? origin : null;
}

export function isAllowedOrigin(origin?: string | null): boolean {
  return resolveCorsOrigin(origin) !== null;
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (origin && matchesAllowedOrigin(origin)) {
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
