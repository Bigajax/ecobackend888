// server/app/middlewares/cors.ts
// CORS policy summary:
// - Allowed origins: https://ecofrontend888.vercel.app e http://localhost:5173 (ver bootstrap/cors).
// - Métodos liberados: GET, POST, PUT, PATCH, DELETE e OPTIONS.
// - Allowed headers sincronizados com o front (authorization/x-guest-id/accept/etc.).
// - OPTIONS requests são respondidas aqui sem autenticação e com log para observabilidade.
import type { Express, Response, Request, NextFunction } from "express";
import {
  ALLOWED_HEADERS_HEADER,
  ALLOWED_METHODS_HEADER,
  EXPOSE_HEADERS_HEADER,
  PREFLIGHT_MAX_AGE_SECONDS,
  allowList,
  corsMiddleware,
  isAllowedOrigin,
} from "../../../bootstrap/cors";
import { log } from "../../../services/promptContext/logger";

/**
 * Acrescente seus headers customizados aqui.
 * Mantém sincronizado com o front (x-guest-id/x-guest-mode) e quaisquer outros que você use.
 */
const VARY_HEADER_VALUE =
  "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";

export function applyCors(app: Express) {
  // Ajuda caches/proxies a variar por Origin e cabeçalhos do preflight
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Vary", VARY_HEADER_VALUE);
    next();
  });

  // Tratamento CENTRALIZADO de PRE-FLIGHT (OPTIONS) para qualquer rota
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "OPTIONS") return next();

    const origin = req.headers.origin;
    const route = req.originalUrl || req.url;

    const allowedOrigin = isAllowedOrigin(origin) && origin ? origin : undefined;
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }

    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS_HEADER);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS_HEADER);
    res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS_HEADER);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", `${PREFLIGHT_MAX_AGE_SECONDS}`);
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    log.info("http.cors.preflight", {
      method: req.method,
      route,
      origin: origin ?? "<none>",
      allowed: Boolean(allowedOrigin),
      allowHeaders: ALLOWED_HEADERS_HEADER,
      allowMethods: ALLOWED_METHODS_HEADER,
    });

    return res.status(204).end();
  });

  // CORS padrão (para requisições não-OPTIONS)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const allowedOrigin = isAllowedOrigin(origin) && origin ? origin : undefined;
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS_HEADER);
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS_HEADER);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS_HEADER);
    res.setHeader("Access-Control-Max-Age", `${PREFLIGHT_MAX_AGE_SECONDS}`);
    res.setHeader("Vary", VARY_HEADER_VALUE);
    next();
  });

  // Mantém seu middleware existente (se ele acrescenta políticas extras)
  app.use(corsMiddleware);
  app.options("*", corsMiddleware);
}

/** Usa os mesmos critérios do preflight para garantir CORS em respostas 404/500 etc. */
export function ensureCorsHeaders(
  res: Response,
  origin?: string | null
) {
  const allowedOrigin = isAllowedOrigin(origin) && origin ? origin : undefined;
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS_HEADER);
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS_HEADER);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS_HEADER);
  res.setHeader("Access-Control-Max-Age", `${PREFLIGHT_MAX_AGE_SECONDS}`);
  res.setHeader("Vary", VARY_HEADER_VALUE);
}

export function getAllowList() {
  return allowList;
}
