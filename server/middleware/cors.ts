import type { NextFunction, Request, Response } from "express";
import { log } from "../services/promptContext/logger";

type OriginRule =
  | { type: "exact"; value: string }
  | { type: "pattern"; value: string; regex: RegExp };

const DEFAULT_ALLOWED_ORIGINS = [
  "https://ecofrontend888.vercel.app",
  "https://*.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const RAW_ENV_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") ?? [];

function normalizeEntry(entry: string): string {
  return entry.trim();
}

function wildcardToRegex(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `^${escaped.replace(/\\\*/g, ".*")}$`;
  return new RegExp(pattern, "i");
}

function buildOriginRules(): OriginRule[] {
  const envEntries = RAW_ENV_ORIGINS.map(normalizeEntry).filter(Boolean);
  const entries = envEntries.length > 0 ? envEntries : DEFAULT_ALLOWED_ORIGINS;

  return entries.map((entry) => {
    if (entry.includes("*")) {
      return { type: "pattern", value: entry, regex: wildcardToRegex(entry) };
    }
    return { type: "exact", value: entry };
  });
}

const ORIGIN_RULES = buildOriginRules();
const EXACT_RULES = ORIGIN_RULES.filter(
  (rule): rule is Extract<OriginRule, { type: "exact" }> => rule.type === "exact"
);
const PATTERN_RULES = ORIGIN_RULES.filter(
  (rule): rule is Extract<OriginRule, { type: "pattern" }> => rule.type === "pattern"
);
const EXACT_ALLOWLIST = new Set(EXACT_RULES.map((rule) => rule.value));
const PATTERN_ALLOWLIST = PATTERN_RULES.map((rule) => rule.regex);

function setVaryHeader(res: Response, value: string) {
  const existing = res.getHeader("Vary");
  if (!existing) {
    res.setHeader("Vary", value);
    return;
  }

  const current = Array.isArray(existing)
    ? existing
        .map((piece) => piece.split(",").map((v) => v.trim()))
        .flat()
    : String(existing)
        .split(",")
        .map((piece) => piece.trim())
        .filter(Boolean);

  if (!current.includes(value)) {
    res.setHeader("Vary", [...current, value].join(", "));
  }
}

function resolveOrigin(origin?: string | null) {
  if (!origin) return { normalized: null, allowed: true };
  const normalized = origin.trim();
  if (!normalized) return { normalized: null, allowed: true };

  if (EXACT_ALLOWLIST.has(normalized)) {
    return { normalized, allowed: true };
  }

  if (PATTERN_ALLOWLIST.some((pattern) => pattern.test(normalized))) {
    return { normalized, allowed: true };
  }

  return { normalized, allowed: false };
}

export function isAllowedOrigin(origin?: string | null): boolean {
  return resolveOrigin(origin).allowed;
}

export const CORS_ALLOW_HEADERS = [
  "content-type",
  "authorization",
  "apikey",
  "x-requested-with",
  "x-client-id",
  "x-trace-id",
  "x-eco-guest-id",
  "x-eco-session-id",
  "x-stream-id",
] as const;

export const CORS_ALLOW_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
] as const;

export const CORS_EXPOSE_HEADERS = ["content-type", "x-request-id"] as const;

type CorsLocals = {
  corsAllowed?: boolean;
  corsOrigin?: string | null;
};

function resolveAndCacheOrigin(req: Request, res: Response) {
  const locals = (res.locals ?? {}) as CorsLocals;
  if (typeof locals.corsAllowed === "boolean") {
    return {
      allowed: locals.corsAllowed,
      normalized: locals.corsOrigin ?? null,
    };
  }

  const headerOrigin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const { normalized, allowed } = resolveOrigin(headerOrigin);

  locals.corsAllowed = allowed;
  locals.corsOrigin = normalized;
  res.locals = locals;

  if (!allowed && normalized) {
    log.warn("CORS_BLOCKED", { origin: normalized, method: req.method, path: req.originalUrl });
  }

  return { allowed, normalized };
}

export function applyCorsResponseHeaders(req: Request, res: Response) {
  const { normalized, allowed } = resolveAndCacheOrigin(req, res);

  setVaryHeader(res, "Origin");

  if (allowed && normalized) {
    res.setHeader("Access-Control-Allow-Origin", normalized);
  } else {
    res.removeHeader("Access-Control-Allow-Origin");
  }

  res.setHeader("Access-Control-Allow-Credentials", "false");
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS.join(", "));
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS.join(", "));
  res.setHeader("Access-Control-Expose-Headers", CORS_EXPOSE_HEADERS.join(", "));
  res.setHeader("Access-Control-Max-Age", "600");
}

export function corsResponseInjector(
  req: Request,
  res: Response,
  next: NextFunction
) {
  applyCorsResponseHeaders(req, res);
  next();
}

export function getConfiguredCorsOrigins(): string[] {
  return ORIGIN_RULES.map((rule) => rule.value);
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const { normalized, allowed } = resolveAndCacheOrigin(req, res);
  applyCorsResponseHeaders(req, res);

  if (req.method === "OPTIONS") {
    const acrMethodRaw = req.headers["access-control-request-method"];
    const acrHeadersRaw = req.headers["access-control-request-headers"];

    const acrMethod = Array.isArray(acrMethodRaw)
      ? acrMethodRaw.join(",")
      : acrMethodRaw ?? null;
    const acrHeaders = Array.isArray(acrHeadersRaw)
      ? acrHeadersRaw.join(",")
      : acrHeadersRaw ?? null;

    log.info("CORS_OPTIONS", {
      origin: normalized,
      method: req.method,
      path: req.originalUrl,
      acrMethod: typeof acrMethod === "string" ? acrMethod : null,
      acrHeaders: typeof acrHeaders === "string" ? acrHeaders : null,
      allowed,
    });

    return res.status(204).end();
  }

  return next();
}

export default corsMiddleware;
