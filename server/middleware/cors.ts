import type { NextFunction, Request, Response } from "express";
import cors, { type CorsOptions, type CorsOptionsDelegate } from "cors";
import { log } from "../services/promptContext/logger";

const EXACT_ALLOWLIST = new Set<string>([
  "https://ecofrontend888.vercel.app",
  "https://ecofrontend888-git-main-rafaels-projects-f3ef53c3.vercel.app",
  "https://ecofrontend888-owixryjyd-rafaels-projects-f3ef53c3.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
]);

const REGEX_ALLOWLIST = [/^https:\/\/.+\.vercel\.app$/i];

export function originOk(origin?: string | null): boolean {
  if (!origin) return true;

  const normalized = origin.trim();
  if (!normalized) return true;

  if (EXACT_ALLOWLIST.has(normalized)) return true;

  return REGEX_ALLOWLIST.some((pattern) => pattern.test(normalized));
}

const DEFAULT_ALLOW_HEADERS =
  "Accept, Authorization, Cache-Control, Content-Type, X-Guest-Id, X-Requested-With";
const DEFAULT_ALLOW_METHODS = "GET,POST,OPTIONS";
const EXPOSE_HEADERS = "X-Guest-Id";
const MAX_AGE_SECONDS = 86_400; // 24h

/**
 * Opções base que espelhamos manualmente no preflight para evitar 503.
 */
const BASE_OPTIONS: Omit<CorsOptions, "origin"> = {
  credentials: true,
  methods: DEFAULT_ALLOW_METHODS.split(","),
  allowedHeaders: DEFAULT_ALLOW_HEADERS.split(/,\s*/),
  exposedHeaders: EXPOSE_HEADERS.split(","),
  maxAge: MAX_AGE_SECONDS,
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
  const requestedHeaders = req.get("Access-Control-Request-Headers");
  const requestedMethod = req.get("Access-Control-Request-Method");

  res.setHeader("Access-Control-Allow-Headers", requestedHeaders || DEFAULT_ALLOW_HEADERS);
  res.setHeader("Access-Control-Allow-Methods", requestedMethod || DEFAULT_ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", String(MAX_AGE_SECONDS));
  res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS);
  setVaryHeader(res, "Origin");

  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
}

export function ensureCorsHeaders(res: Response, origin?: string | null) {
  res.setHeader("Access-Control-Allow-Headers", DEFAULT_ALLOW_HEADERS);
  res.setHeader("Access-Control-Allow-Methods", DEFAULT_ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", String(MAX_AGE_SECONDS));
  res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS);
  setVaryHeader(res, "Origin");

  if (origin && originOk(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
}

export function preflightHandler(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "OPTIONS") return next();

  const origin = req.headers.origin ?? null;
  const allowed = originOk(origin);
  const requestHeaders = req.get("Access-Control-Request-Headers") ?? null;
  const requestMethod = req.get("Access-Control-Request-Method") ?? null;

  log.info("[cors] preflight", {
    origin,
    allowed,
    path: req.path,
    requestHeaders,
    requestMethod,
  });

  if (origin && !allowed) {
    console.warn("[cors] origin blocked", { origin, path: req.path });
    log.warn("[cors] origin_blocked", { origin, path: req.path });
  }

  applyPreflightHeaders(req, res, allowed);
  return res.status(204).end();
}

const delegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin ?? undefined;
  const allowed = originOk(origin);

  if (origin && !allowed) {
    console.warn("[cors] origin blocked", { origin, path: req.path });
    log.warn("[cors] origin_blocked", { origin, path: req.path });
  } else if (origin) {
    log.info("[cors] request", { origin, allowed, path: req.path });
  }

  const options: CorsOptions = {
    ...BASE_OPTIONS,
    origin: allowed ? origin : false,
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

    if (req.method === "OPTIONS") {
      const allowed = originOk(req.headers.origin);
      applyPreflightHeaders(req, res, allowed);
      return res.status(204).end();
    }

    return next();
  });
}

export default corsMiddleware;
