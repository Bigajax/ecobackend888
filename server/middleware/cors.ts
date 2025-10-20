import type { NextFunction, Request, Response } from "express";
import cors, { type CorsOptions, type CorsOptionsDelegate } from "cors";
import { log } from "../services/promptContext/logger";

const EXACT_ALLOWLIST = new Set<string>([
  "https://ecofrontend888.vercel.app",
  "http://localhost:5173",
]);

const REGEX_ALLOWLIST = [/^https:\/\/ecofrontend888-[a-z0-9-]+\.vercel\.app$/i];

export function isAllowedOrigin(origin?: string | null): boolean {
  if (!origin) return true;

  const normalized = origin.trim();
  if (!normalized) return true;

  if (EXACT_ALLOWLIST.has(normalized)) return true;

  return REGEX_ALLOWLIST.some((pattern) => pattern.test(normalized));
}

export const CORS_ALLOW_HEADERS = [
  "Accept",
  "Content-Type",
  "Origin",
  "X-Eco-Guest-Id",
  "X-Eco-Session-Id",
  "X-Requested-With",
  "Cache-Control",
  "Authorization",
] as const;
export const CORS_ALLOW_METHODS = ["GET", "POST", "OPTIONS"] as const;
export const CORS_EXPOSE_HEADERS = [
  "X-Request-Id",
  "Cache-Control",
  "X-Eco-Guest-Id",
  "X-Eco-Session-Id",
] as const;
export const CORS_MAX_AGE_SECONDS = 600; // 10 min

/**
 * Opções base que espelhamos manualmente no preflight para evitar 503.
 */
const BASE_OPTIONS: Omit<CorsOptions, "origin"> = {
  credentials: false,
  methods: [...CORS_ALLOW_METHODS],
  allowedHeaders: [...CORS_ALLOW_HEADERS],
  exposedHeaders: [...CORS_EXPOSE_HEADERS],
  maxAge: CORS_MAX_AGE_SECONDS,
};

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

function applyPreflightHeaders(req: Request, res: Response, allowed: boolean) {
  const origin = req.headers.origin ?? undefined;

  res.setHeader(
    "Access-Control-Allow-Headers",
    CORS_ALLOW_HEADERS.join(", ")
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    CORS_ALLOW_METHODS.join(",")
  );
  res.setHeader("Access-Control-Max-Age", String(CORS_MAX_AGE_SECONDS));
  res.setHeader("Access-Control-Expose-Headers", CORS_EXPOSE_HEADERS.join(","));
  res.setHeader("Access-Control-Allow-Credentials", "false");
  setVaryHeader(res, "Origin");

  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
}

export function applyCorsResponseHeaders(req: Request, res: Response) {
  const locals = (res.locals ?? {}) as Record<string, unknown>;
  const explicitOrigin =
    typeof locals.corsOrigin === "string"
      ? (locals.corsOrigin as string)
      : undefined;
  const headerOrigin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const origin = explicitOrigin ?? headerOrigin ?? null;
  const allowed =
    typeof locals.corsAllowed === "boolean"
      ? Boolean(locals.corsAllowed)
      : isAllowedOrigin(origin);

  setVaryHeader(res, "Origin");

  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.removeHeader("Access-Control-Allow-Origin");
  }

  res.setHeader("Access-Control-Allow-Credentials", "false");
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS.join(", "));
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS.join(","));
  res.setHeader("Access-Control-Max-Age", String(CORS_MAX_AGE_SECONDS));
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

export function preflightHandler(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "OPTIONS") return next();

  const path = req.originalUrl || req.path;
  if (!(path.startsWith("/api/") || path === "/api")) {
    return next();
  }

  const origin = req.headers.origin ?? null;
  const allowed = isAllowedOrigin(origin);

  if (origin && !allowed) {
    log.warn("[cors] origin_blocked", { origin, path });
  }

  applyPreflightHeaders(req, res, allowed);

  (res.locals as Record<string, unknown>).corsAllowed = allowed;
  (res.locals as Record<string, unknown>).corsOrigin = origin;

  log.info("[cors] preflight", {
    origin: origin ?? null,
    path,
    allowed,
    status: 204,
  });

  return res.status(204).end();
}

const delegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin ?? undefined;
  const allowed = isAllowedOrigin(origin);

  const effectiveOrigin = allowed && origin ? origin : false;

  const options: CorsOptions = {
    ...BASE_OPTIONS,
    origin: effectiveOrigin,
  };

  callback(null, options);
};

const corsInstance = cors(delegate);

export function getStaticCorsWhitelist(): string[] {
  return Array.from(EXACT_ALLOWLIST);
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  setVaryHeader(res, "Origin");
  corsInstance(req, res, (err) => {
    if (err) {
      log.error("[cors] middleware_error", {
        message: (err as Error).message,
        origin: req.headers.origin ?? null,
        path: req.path,
      });
      return next(err);
    }

    const origin = req.headers.origin ?? null;
    const allowed = isAllowedOrigin(origin);

    if (origin && !allowed) {
      log.warn("[cors] origin_blocked", { origin, path: req.path });
    }

    const locals = res.locals as Record<string, unknown>;
    locals.corsAllowed = allowed;
    locals.corsOrigin = origin;
    locals.__corsHandled = true;

    applyCorsResponseHeaders(req, res);

    const requestPath = req.originalUrl || req.path;
    log.info("[cors] request", {
      origin: origin ?? null,
      path: requestPath,
      allowed,
    });

    return next();
  });
}

export default corsMiddleware;
