// server/app/middlewares/cors.ts
// CORS policy summary:
// - Allowed origins come from PROD + LOCAL defaults and CORS_ALLOW_ORIGINS env (see bootstrap/cors).
// - Methods expostos: GET, POST, PUT, PATCH, DELETE, OPTIONS e HEAD.
// - Allowed headers: authorization, content-type, x-guest-id, x-requested-with.
// - OPTIONS requests are answered here without authentication and logged for observability.
import type { Express, Response, Request, NextFunction } from "express";
import {
  ALLOWED_HEADERS_HEADER,
  ALLOWED_METHODS,
  ALLOWED_METHODS_HEADER,
  EXPOSE_HEADERS_HEADER,
  allowList,
  corsMiddleware,
  isAllowedOrigin,
} from "../../../bootstrap/cors";
import { log } from "../../../services/promptContext/logger";

/**
 * Acrescente seus headers customizados aqui.
 * Mantém sincronizado com o front (x-guest-id/x-guest-mode) e quaisquer outros que você use.
 */
export function applyCors(app: Express) {
  // Ajuda caches/proxies a variar por Origin e cabeçalhos do preflight
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      "Vary",
      "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
    );
    next();
  });

  // Tratamento CENTRALIZADO de PRE-FLIGHT (OPTIONS) para qualquer rota
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "OPTIONS") return next();

    const origin = req.headers.origin;
    const route = req.originalUrl || req.url;

    if (isAllowedOrigin(origin) && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS_HEADER);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS_HEADER);
    res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS_HEADER);
    res.setHeader("Access-Control-Allow-Credentials", "false");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    log.info("http.cors.preflight", {
      method: req.method,
      route,
      origin: origin ?? "<none>",
      allowed: isAllowedOrigin(origin),
    });

    return res.status(204).end();
  });

  // CORS padrão (para requisições não-OPTIONS)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin) && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Credentials", "false");
    res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS_HEADER);
    next();
  });

  // Mantém seu middleware existente (se ele acrescenta políticas extras)
  app.use(corsMiddleware);
  app.options("*", corsMiddleware);
}

/** Usa os mesmos critérios do preflight para garantir CORS em respostas 404/500 etc. */
export function ensureCorsHeaders(res: Response, origin?: string | null) {
  if (isAllowedOrigin(origin) && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "false");
  res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS_HEADER);
  // NÃO setamos Allow-Headers/Methods aqui para não poluir respostas normais;
  // os preflights já cobrem isso.
}

export function getAllowList() {
  return allowList;
}
