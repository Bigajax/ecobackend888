// server/app/middlewares/cors.ts
import type { Express, Response, Request, NextFunction } from "express";
import {
  ALLOWED_METHODS,
  allowList,
  corsMiddleware,
  isAllowedOrigin,
} from "../../../bootstrap/cors";

/**
 * Acrescente seus headers customizados aqui.
 * Mantém sincronizado com o front (x-guest-id/x-guest-mode) e quaisquer outros que você use.
 */
const GUEST_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "Accept",
  "Origin",
  "X-Guest-Id",
  "X-Guest-Mode",
];

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
    if (isAllowedOrigin(origin) && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS.join(","));
    res.setHeader("Access-Control-Allow-Headers", GUEST_ALLOWED_HEADERS.join(", "));
    // fix: align OPTIONS preflight with SSE caching directives
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    return res.status(200).end();
  });

  // CORS padrão (para requisições não-OPTIONS)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin) && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
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
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  // NÃO setamos Allow-Headers/Methods aqui para não poluir respostas normais;
  // os preflights já cobrem isso.
}

export function getAllowList() {
  return allowList;
}
