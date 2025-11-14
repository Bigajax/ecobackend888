import type { NextFunction, Request, Response } from "express";

const DEFAULT_EXACT_ALLOWLIST = [
  "https://ecofrontend888.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

const DEFAULT_REGEX_ALLOWLIST = [/^https:\/\/[a-z0-9-]+\.vercel\.app$/];

const wildcardPlaceholder = "__WILDCARD__";

function wildcardPatternToRegExp(pattern: string): RegExp {
  const placeholderPattern = pattern.replace(/\*/g, wildcardPlaceholder);
  const escapedPattern = placeholderPattern.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
  const regexSource = `^${escapedPattern.replace(new RegExp(wildcardPlaceholder, "g"), ".*")}$`;
  return new RegExp(regexSource);
}

function parseAllowlistEntry(entry: string): { exact?: string; pattern?: RegExp } | null {
  const value = entry.trim();
  if (!value) return null;

  if (value.includes("*")) {
    return { pattern: wildcardPatternToRegExp(value) };
  }

  if (value.startsWith("^") || value.endsWith("$")) {
    try {
      return { pattern: new RegExp(value) };
    } catch (error) {
      console.warn(`[cors] Ignorando padrão inválido: ${value}`, error);
      return null;
    }
  }

  return { exact: value };
}

const rawAllowlist = process.env.CORS_ALLOWLIST;

const envAllowlist = typeof rawAllowlist === "string" ? rawAllowlist.split(",") : [];

const parsedEnvAllowlist = envAllowlist
  .map(parseAllowlistEntry)
  .filter((entry): entry is { exact?: string; pattern?: RegExp } => entry !== null);

const exactOrigins = new Set<string>(DEFAULT_EXACT_ALLOWLIST);
const regexOrigins = [...DEFAULT_REGEX_ALLOWLIST];

for (const entry of parsedEnvAllowlist) {
  if (entry.exact) {
    exactOrigins.add(entry.exact);
  }
  if (entry.pattern) {
    regexOrigins.push(entry.pattern);
  }
}

export const CORS_ALLOWED_ORIGINS = Array.from(exactOrigins);
export const CORS_ALLOWED_REGEX_PATTERNS = regexOrigins;
export const PRIMARY_CORS_ORIGIN = CORS_ALLOWED_ORIGINS[0];

export const CORS_ALLOWED_METHODS = ["GET", "POST", "OPTIONS", "HEAD"] as const;
export const CORS_ALLOWED_HEADERS = ["Content-Type", "Accept"] as const;

export const CORS_ALLOWED_METHODS_VALUE = CORS_ALLOWED_METHODS.join(",");
export const CORS_ALLOWED_HEADERS_VALUE = CORS_ALLOWED_HEADERS.join(", ");
export const ASK_ECO_ALLOWED_METHODS_VALUE = CORS_ALLOWED_METHODS_VALUE;
export const ASK_ECO_ALLOWED_HEADERS_VALUE = CORS_ALLOWED_HEADERS_VALUE;

const CORS_MAX_AGE_SECONDS = 86_400;

function requestOrigin(req: Request): string | null {
  return typeof req.headers.origin === "string" ? req.headers.origin : null;
}

export function matchesAllowedOrigin(origin: string): boolean {
  if (exactOrigins.has(origin)) return true;
  return CORS_ALLOWED_REGEX_PATTERNS.some((regex) => regex.test(origin));
}

export function resolveCorsOrigin(origin?: string | null): string | null {
  if (!origin) return null;
  return matchesAllowedOrigin(origin) ? origin : null;
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
  const varyRequired = [
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
  ];
  const currentVary = res.getHeader("Vary");
  const varySet = new Set<string>();
  if (typeof currentVary === "string") {
    for (const entry of currentVary.split(",")) {
      const trimmed = entry.trim();
      if (trimmed) varySet.add(trimmed);
    }
  } else if (Array.isArray(currentVary)) {
    for (const entry of currentVary) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (trimmed) varySet.add(trimmed);
    }
  }
  for (const required of varyRequired) varySet.add(required);
  res.setHeader("Vary", Array.from(varySet).join(", "));
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS_VALUE);
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS_VALUE);
  res.setHeader("Access-Control-Max-Age", String(CORS_MAX_AGE_SECONDS));
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

export function applyCorsResponseHeaders(req: Request, res: Response) {
  const origin = requestOrigin(req);
  const allowedOrigin = resolveCorsOrigin(origin);
  const headerOrigin = allowedOrigin ?? (!origin ? PRIMARY_CORS_ORIGIN : null);
  applyCorsHeaders(res, headerOrigin);
  return allowedOrigin;
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  applyCorsResponseHeaders(req, res);
  next();
}

export function corsResponseInjector(req: Request, res: Response, next: NextFunction) {
  applyCorsResponseHeaders(req, res);
  next();
}

export function getConfiguredCorsOrigins(): string[] {
  return [
    ...CORS_ALLOWED_ORIGINS,
    ...CORS_ALLOWED_REGEX_PATTERNS.map((pattern) => pattern.source),
  ];
}

export function setCorsHeaders(res: Response, origin: string | null) {
  const allowedOrigin = resolveCorsOrigin(origin);
  const headerOrigin = allowedOrigin ?? (origin ? null : PRIMARY_CORS_ORIGIN);
  applyCorsHeaders(res, headerOrigin);
  return { allowedOrigin, headerOrigin };
}
