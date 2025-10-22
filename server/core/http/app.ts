// CORS/Streaming notes:
// - Allowed origins resolvidos via middleware/cors (whitelist estática + previews *.vercel.app).
// - Métodos liberados: GET/POST/OPTIONS/HEAD + REST verbs; headers espelham BASE_OPTIONS.allowedHeaders.
// - OPTIONS nunca exige auth e responde antes dos demais middlewares.

import { createHash } from "node:crypto";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";

import corsMiddleware, {
  applyCorsResponseHeaders,
  corsResponseInjector,
} from "../../middleware/cors";
import { requestLogger } from "./middlewares/logger";
import { normalizeQuery } from "./middlewares/queryNormalizer";
import { ModuleCatalog } from "../../domains/prompts/ModuleCatalog";
import { ensureGuestIdentity } from "./guestIdentity";

import promptRoutes, { askEcoRoutes } from "../../routes/promptRoutes";
import profileRoutes from "../../routes/perfilEmocionalRoutes";
import voiceTTSRoutes from "../../routes/voiceTTSRoutes";
import voiceFullRoutes from "../../routes/voiceFullRoutes";
import openrouterRoutes from "../../routes/openrouterRoutes";
import relatorioRoutes from "../../routes/relatorioEmocionalRoutes";
import feedbackRoutes from "../../routes/feedbackRoutes";
import mensagemRoutes from "../../routes/mensagemRoutes";
import signalRoutes from "../../routes/signalRoutes";
import moduleUsageRoutes from "../../routes/moduleUsageRoutes";
import banditRoutes from "../../routes/banditRoutes";
import policyRoutes from "../../routes/policyRoutes";
import memoryRoutes, {
  memoryController,
} from "../../domains/memory/routes";
import { log } from "../../services/promptContext/logger";
import { isSupabaseConfigured } from "../../lib/supabaseAdmin";
import { guestSessionMiddleware } from "./middlewares/guestSession";
import guestRoutes from "../../routes/guestRoutes";
import requireAdmin from "../../mw/requireAdmin";

declare module "express-serve-static-core" {
  interface Request {
    guestId?: string;
  }
}

const RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.API_RATE_LIMIT_MAX_REQUESTS ?? 60);
const RATE_LIMIT_EXCLUSIONS = new Set(["/", "/healthz", "/readyz", "/debug/modules"]);

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
      if (token) return `auth:${hashToken(token)}`;
    }
  }
  const guestId = (req as any).guest?.id || req.guestId;
  if (typeof guestId === "string" && guestId.trim()) return `guest:${guestId.trim()}`;
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
  // Nunca limite preflight
  if (req.method === "OPTIONS") return next();
  if (RATE_LIMIT_EXCLUSIONS.has(req.path)) return next();

  const now = Date.now();
  const key = getRateLimitKey(req);
  const bucket = touchBucket(key, now);

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);
    res.setHeader("Retry-After", retryAfterSeconds.toString());
    return res.status(429).json({ code: "RATE_LIMITED" });
  }
  next();
}

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // 1) CORS global antes de qualquer rota
  app.use(corsMiddleware);
  app.options("/api/*", (_req, res) => res.status(204).end());
  app.use(corsResponseInjector);
  app.options("*", corsMiddleware);

  // 2) Parsers (não executam em OPTIONS)
  const standardJsonParser = express.json({ limit: "1mb" });
  const signalJsonParser = express.json({ limit: "32kb" });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/signal")) {
      return signalJsonParser(req, res, next);
    }
    return standardJsonParser(req, res, next);
  });
  app.use(express.urlencoded({ extended: true }));

  // 3) Identidade guest (gera/propaga X-Eco-Guest-Id / cookie e X-Eco-Session-Id)
  app.use(ensureGuestIdentity);

  // 4) Rate limit simples baseado em JWT/guest/ip
  app.use(apiRateLimiter);

  // 5) Sessão convidado + logs + normalização de query
  app.use(guestSessionMiddleware);
  app.use(requestLogger);
  app.use(normalizeQuery);

  // 6) Healthchecks e debug
  app.get("/", (_req, res) => res.status(200).send("OK"));
  app.get("/healthz", (_req, res) =>
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
  );
  app.get("/api/health", (_req, res) =>
    res.status(200).json({ ok: true, service: "eco-backend", ts: new Date().toISOString() })
  );
  app.get("/readyz", (_req, res) => {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ status: "degraded", reason: "no-admin-config" });
    }
    return res.status(200).json({ status: "ready" });
  });
  app.get("/debug/modules", (_req, res) => {
    const stats = ModuleCatalog.stats();
    res.json({
      roots: stats.roots,
      indexedCount: stats.indexedCount,
      cachedCount: stats.cachedCount,
      built: stats.built,
      sample: ModuleCatalog.listIndexed(50),
    });
  });

  // 7) Rotas (prefixo /api) — /api/ask-eco (SSE) vive em promptRoutes
  app.use("/api/ask-eco", askEcoRoutes);
  app.use("/api", promptRoutes);
  app.use("/api/memorias", memoryRoutes);
  app.use("/api/memories", memoryRoutes);
  app.get("/api/similares_v2", requireAdmin, memoryController.findSimilarV2);
  app.post("/api/similares_v2", requireAdmin, memoryController.findSimilar);
  app.use("/api/perfil-emocional", profileRoutes);
  app.use("/api/perfil_emocional", profileRoutes);
  app.use("/api/v1/perfil-emocional", profileRoutes);
  app.use("/api/voice", voiceTTSRoutes);
  app.use("/api/voice", voiceFullRoutes);
  app.use("/api", openrouterRoutes);
  app.use("/api/guest", guestRoutes);
  app.use("/api/relatorio-emocional", relatorioRoutes);
  app.use("/api/relatorio_emocional", relatorioRoutes);
  app.use("/api/v1/relatorio-emocional", relatorioRoutes);
  app.use("/api/feedback", feedbackRoutes);
  app.use("/api/mensagem", mensagemRoutes);
  app.use("/api/signal", signalRoutes);
  app.use("/api/module-usage", moduleUsageRoutes);
  app.use("/api/bandit", banditRoutes);
  app.use("/api/policy", policyRoutes);

  // Aliases sem /api (clientes legados)
  app.use("/memorias", memoryRoutes);
  app.use("/memories", memoryRoutes);
  app.use("/perfil-emocional", profileRoutes);
  app.use("/relatorio-emocional", relatorioRoutes);

  // Reforça CORS após as rotas, inclusive para middlewares que lançam 4xx/5xx
  app.use(corsResponseInjector);

  // 8) 404
  app.use((req, res) => {
    applyCorsResponseHeaders(req, res);
    res
      .status(404)
      .json({ error: "Rota não encontrada", path: req.originalUrl });
  });

  // 9) 500
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    applyCorsResponseHeaders(req, res);

    log.error("Erro não tratado:", {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      status: err?.status ?? err?.statusCode,
    });

    const status = Number(err?.status || err?.statusCode) || 500;
    const message = err?.message || "Erro interno";

    res.status(status).json({ ok: false, error: message });
  });

  return app;
}
