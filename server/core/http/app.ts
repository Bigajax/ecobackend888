// server/core/http/app.ts
// CORS/Streaming notes:
// - Allowed origins resolved via middleware/cors (static whitelist + Vercel previews).
// - Methods enabled: GET/POST/OPTIONS/HEAD plus REST verbs; headers mirror ALLOWED_HEADERS (JSON/auth/X-Guest-*).
// - OPTIONS never requires auth and is answered before other middlewares.
import { createHash } from "node:crypto";

import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";

import {
  corsMiddleware,
  ensureCorsHeaders,
  ALLOWED_HEADERS_HEADER,
  ALLOWED_METHODS_HEADER,
  EXPOSED_HEADERS_HEADER,
} from "../../middleware/cors";
import { requestLogger } from "./middlewares/logger";
import { normalizeQuery } from "./middlewares/queryNormalizer";
import { ModuleCatalog } from "../../domains/prompts/ModuleCatalog";
import { ensureGuestIdentity } from "./guestIdentity";

import promptRoutes from "../../routes/promptRoutes";
import profileRoutes from "../../routes/perfilEmocionalRoutes";
import voiceTTSRoutes from "../../routes/voiceTTSRoutes";
import voiceFullRoutes from "../../routes/voiceFullRoutes";
import openrouterRoutes from "../../routes/openrouterRoutes";
import relatorioRoutes from "../../routes/relatorioEmocionalRoutes";
import feedbackRoutes from "../../routes/feedback";
import memoryRoutes from "../../domains/memory/routes";
import { log } from "../../services/promptContext/logger";
import { isSupabaseConfigured } from "../../lib/supabaseAdmin";
import { guestSessionMiddleware } from "./middlewares/guestSession";
import guestRoutes from "../../routes/guestRoutes";

declare module "express-serve-static-core" {
  interface Request {
    guestId?: string;
  }
}

const RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.API_RATE_LIMIT_MAX_REQUESTS ?? 60);
const RATE_LIMIT_EXCLUSIONS = new Set(["/", "/healthz", "/readyz"]);

type RateBucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, RateBucket>();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

function getRateLimitKey(req: Request): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    const normalized = authHeader.trim();
    if (/^Bearer\s+/i.test(normalized)) {
      const token = normalized.replace(/^Bearer\s+/i, "").trim();
      if (token) {
        return `auth:${hashToken(token)}`;
      }
    }
  }

  const guestId = req.guest?.id || req.guestId;
  if (typeof guestId === "string" && guestId.trim()) {
    return `guest:${guestId.trim()}`;
  }

  return `ip:${req.ip}`;
}

function touchBucket(key: string, now: number): RateBucket {
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh: RateBucket = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(key, fresh);
    return fresh;
  }

  existing.count += 1;
  return existing;
}

function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (RATE_LIMIT_EXCLUSIONS.has(req.path)) {
    return next();
  }

  const now = Date.now();
  const key = getRateLimitKey(req);
  const bucket = touchBucket(key, now);

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);
    res.setHeader("Retry-After", retryAfterSeconds.toString());
    return res.status(429).json({ code: "RATE_LIMITED" });
  }

  return next();
}

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // 1) CORS sempre primeiro
  app.use(corsMiddleware);

  // 2) PRE-FLIGHTS globais úteis para clientes que chamam /api/*
  app.options("*", corsMiddleware, (req: Request, res: Response) => {
    ensureCorsHeaders(res, req.headers.origin as string | undefined);
    res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS_HEADER);
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS_HEADER);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS_HEADER);
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    return res.status(204).end();
  });

  // 3) Demais middlewares
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));


  // Guest identity (gera e propaga X-Guest-Id/Set-Cookie quando necessário)
  app.use(ensureGuestIdentity);

  // Rate limit simples baseado em JWT ou guestId
  app.use(apiRateLimiter);

  // Popula req.guest e aplica regras específicas de sessão convidada (telemetria)
  app.use(guestSessionMiddleware);

  app.use(requestLogger);

  app.use(normalizeQuery);

  // 5) Healthchecks e debug
  app.get("/", (_req: Request, res: Response) => res.status(200).send("OK"));

  app.get("/healthz", (_req: Request, res: Response) =>
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
  );

  app.get("/readyz", (_req: Request, res: Response) => {
    if (!isSupabaseConfigured()) {
      return res
        .status(503)
        .json({ status: "degraded", reason: "no-admin-config" });
    }
    return res.status(200).json({ status: "ready" });
  });

  app.get("/debug/modules", (_req: Request, res: Response) => {
    const stats = ModuleCatalog.stats();
    res.json({
      roots: stats.roots,
      indexedCount: stats.indexedCount,
      cachedCount: stats.cachedCount,
      built: stats.built,
      sample: ModuleCatalog.listIndexed(50),
    });
  });

  // 6) Rotas (prefixo /api) — o promptRoutes contém POST /api/ask-eco (SSE)
  app.use("/api", promptRoutes);
  app.use("/api/memorias", memoryRoutes);
  app.use("/api/memories", memoryRoutes);
  app.use("/api/perfil-emocional", profileRoutes);
  app.use("/api/v1/perfil-emocional", profileRoutes);
  app.use("/api/voice", voiceTTSRoutes);
  app.use("/api/voice", voiceFullRoutes);
  app.use("/api", openrouterRoutes);
  app.use("/api/guest", guestRoutes);
  app.use("/api/relatorio-emocional", relatorioRoutes);
  app.use("/api/v1/relatorio-emocional", relatorioRoutes);
  app.use("/api/feedback", feedbackRoutes);

  // Aliases sem /api (se algum cliente legado consome)
  app.use("/memorias", memoryRoutes);
  app.use("/memories", memoryRoutes);
  app.use("/perfil-emocional", profileRoutes);
  app.use("/relatorio-emocional", relatorioRoutes);

  // 7) 404
  app.use((req: Request, res: Response) => {
    const origin = req.headers.origin as string | undefined;
    ensureCorsHeaders(res, origin);
    res
      .status(404)
      .json({ error: "Rota não encontrada", path: req.originalUrl });
  });

  // 8) 500
  app.use(
    (err: any, req: Request, res: Response, _next: NextFunction) => {
      const origin = req.headers.origin as string | undefined;
      ensureCorsHeaders(res, origin);
      if (req.method === "OPTIONS") return res.status(200).end();

      log.error("Erro não tratado:", {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      });

      return res.status(500).json({ error: "Erro interno" });
    }
  );

  return app;
}
