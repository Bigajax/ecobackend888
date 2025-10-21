import type { NextFunction, Request, Response } from "express";
import cors, { type CorsOptions } from "cors";
import { log } from "../services/promptContext/logger";

type OriginRule =
  | { type: "exact"; value: string }
  | { type: "pattern"; value: string; regex: RegExp };

const DEFAULT_FRONT_ORIGIN = "https://ecofrontend888.vercel.app";

const RAW_ENV_ORIGINS = process.env.CORS_ORIGINS?.split(",") ?? [];

function normalizeEntry(entry: string): string {
  return entry.trim();
}

function wildcardToRegex(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `^${escaped.replace(/\\\*/g, ".*")}$`;
  return new RegExp(pattern, "i");
}

function buildOriginRules(): OriginRule[] {
  const entries = RAW_ENV_ORIGINS.map(normalizeEntry).filter(Boolean);

  if (entries.length > 0) {
    return entries.map((entry) => {
      if (entry.includes("*")) {
        return { type: "pattern", value: entry, regex: wildcardToRegex(entry) };
      }
      return { type: "exact", value: entry };
    });
  }

  return [
    { type: "pattern", value: "http(s)://localhost:*", regex: /^https?:\/\/localhost(?::\d+)?$/i },
    { type: "pattern", value: "http(s)://127.0.0.1:*", regex: /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i },
    {
      type: "pattern",
      value: "https://ecofrontend888-*.vercel.app",
      regex: /^https:\/\/ecofrontend888-[a-z0-9-]+\.vercel\.app$/i,
    },
    { type: "exact", value: DEFAULT_FRONT_ORIGIN },
  ];
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
  "Content-Type",
  "Authorization",
  "apikey",
  "X-Client-Id",
  "X-Trace-Id",
  "x-supabase-auth",
  "x-supabase-signature",
  "x-requested-with",
] as const;

export const CORS_ALLOW_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

export const CORS_EXPOSE_HEADERS = [
  "X-Request-Id",
  "Cache-Control",
  "X-Eco-Guest-Id",
  "X-Eco-Session-Id",
] as const;

export const corsOptions: CorsOptions = {
  credentials: true,
  methods: [...CORS_ALLOW_METHODS],
  allowedHeaders: [...CORS_ALLOW_HEADERS],
  exposedHeaders: [...CORS_EXPOSE_HEADERS],
  maxAge: 600,
  optionsSuccessStatus: 200,
  origin(origin, callback) {
    const { normalized, allowed } = resolveOrigin(origin ?? undefined);

    if (!allowed && normalized) {
      log.warn("CORS_BLOCKED", { origin: normalized });
      callback(null, false);
      return;
    }

    callback(null, normalized ?? true);
  },
};

export const corsMiddleware = cors(corsOptions);

export function applyCorsResponseHeaders(req: Request, res: Response) {
  const headerOrigin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const locals = (res.locals ?? {}) as Record<string, unknown>;
  const explicitOrigin =
    typeof locals.corsOrigin === "string" ? (locals.corsOrigin as string) : undefined;
  const origin = explicitOrigin ?? headerOrigin ?? null;
  const { normalized, allowed } = resolveOrigin(origin);

  setVaryHeader(res, "Origin");

  if (allowed && normalized) {
    res.setHeader("Access-Control-Allow-Origin", normalized);
  } else {
    res.removeHeader("Access-Control-Allow-Origin");
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS.join(","));
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS.join(","));
  res.setHeader("Access-Control-Expose-Headers", CORS_EXPOSE_HEADERS.join(","));
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

export default corsMiddleware;
