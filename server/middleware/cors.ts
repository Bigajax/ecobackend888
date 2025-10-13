import type { NextFunction, Request, Response } from "express";
import cors, { type CorsOptions, type CorsOptionsDelegate } from "cors";
import { log } from "../services/promptContext/logger";

/**
 * Whitelist estática + regra para previews do Vercel.
 * Ajuste/adicione domínios do front aqui.
 */
const STATIC_ALLOWLIST = new Set<string>([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://ecofrontend888.vercel.app",
  "https://eco-frontend.vercel.app",
]);

function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true; // chamadas internas / curl sem Origin
  if (STATIC_ALLOWLIST.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

/**
 * Opções base que espelhamos manualmente no preflight para evitar 503.
 */
const BASE_OPTIONS: Omit<CorsOptions, "origin"> = {
  credentials: true,
  methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Guest-Id",
    "Accept",
    "Cache-Control",
    "X-Requested-With",
  ],
  exposedHeaders: ["X-Guest-Id"],
  maxAge: 86_400, // 24h
};

const delegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin ?? undefined;
  const allowed = isAllowedOrigin(origin);

  if (req.method === "OPTIONS") {
    log.info("[cors] preflight", { origin: origin ?? null, allowed, path: req.path });
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
  return Array.from(STATIC_ALLOWLIST);
}

/** Garante cabeçalhos estáveis (útil em preflight manual). */
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

function applyStaticHeaders(res: Response) {
  // Métodos
  const methods = Array.isArray(BASE_OPTIONS.methods)
    ? BASE_OPTIONS.methods.join(", ")
    : String(BASE_OPTIONS.methods);
  res.setHeader("Access-Control-Allow-Methods", methods);

  // Allowed headers
  const allowed = Array.isArray(BASE_OPTIONS.allowedHeaders)
    ? BASE_OPTIONS.allowedHeaders.join(", ")
    : String(BASE_OPTIONS.allowedHeaders);
  res.setHeader("Access-Control-Allow-Headers", allowed);

  // Expose headers
  const exposed = Array.isArray(BASE_OPTIONS.exposedHeaders)
    ? BASE_OPTIONS.exposedHeaders.join(", ")
    : String(BASE_OPTIONS.exposedHeaders);
  res.setHeader("Access-Control-Expose-Headers", exposed);

  // Max-Age / Credentials
  res.setHeader("Access-Control-Max-Age", String(BASE_OPTIONS.maxAge ?? 0));
  if (BASE_OPTIONS.credentials) res.setHeader("Access-Control-Allow-Credentials", "true");
}

/**
 * Expõe helpers para uso em outros pontos (se necessário).
 */
export function ensureCorsHeaders(res: Response, origin?: string | null) {
  setVaryHeader(res, "Origin");
  applyStaticHeaders(res);
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
}

/**
 * Middleware principal de CORS.
 * - Usa `cors` com delegate para calcular origin dinamicamente.
 * - Responde OPTIONS rapidamente (204) **sempre com cabeçalhos completos**,
 *   evitando 503 no Render e bloqueios do navegador.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  setVaryHeader(res, "Origin");

  // Primeiro, deixe o `cors` montar os headers com base no delegate
  corsInstance(req, res, (err) => {
    if (err) {
      log.error("[cors] middleware_error", {
        message: (err as Error).message,
        origin: req.headers.origin ?? null,
        path: req.path,
      });
      return next(err);
    }

    // Atalho de preflight: responda aqui mesmo com cabeçalhos estáticos + Allow-Origin correto
    if (req.method === "OPTIONS") {
      ensureCorsHeaders(res, req.headers.origin as string | undefined);
      // Se a origem não é permitida, devolvemos 204 sem Allow-Origin — o browser vai bloquear.
      return res.sendStatus(204);
    }

    next();
  });
}

export default corsMiddleware;
