// server/app/createApp.ts
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { applyCors, ensureCorsHeaders } from "./middlewares/cors";
import { requestLogger } from "./middlewares/logger";
import { normalizeQuery } from "./middlewares/queryNormalizer";
import { ModuleCatalog } from "../../domains/prompts/ModuleCatalog";
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

const GUEST_ALLOWED_HEADERS =
  "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Guest-Id, X-Guest-Mode";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);

  // CORS sempre primeiro
  applyCors(app);

  // ---- PRE-FLIGHT GLOBALS ---------------------------------------------------
  // /api/* (todas as rotas REST)
  app.options("/api/*", (req: Request, res: Response) => {
    ensureCorsHeaders(res, req.headers.origin as string | undefined);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", GUEST_ALLOWED_HEADERS);
    return res.sendStatus(204);
  });
  // /ask-eco (alias sem /api, usado pelo front em alguns ambientes)
  app.options("/ask-eco", (req: Request, res: Response) => {
    ensureCorsHeaders(res, req.headers.origin as string | undefined);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", GUEST_ALLOWED_HEADERS);
    return res.sendStatus(204);
  });

  // ---- HANDLER DEDICADO AO ENDPOINT SSE ------------------------------------
  // para garantir os cabeçalhos certos mesmo quando a rota for montada depois
  const sseEntry = (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") {
      ensureCorsHeaders(res, req.headers.origin as string | undefined);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", GUEST_ALLOWED_HEADERS);
      return res.sendStatus(204);
    }
    ensureCorsHeaders(res, req.headers.origin as string | undefined);
    res.setHeader("Vary", "Origin");
    if (req.method === "POST") {
      // recomendações p/ SSE via fetch
      res.setHeader("Cache-Control", "no-cache, no-transform");
    }
    return next();
  };

  // atende nos dois caminhos
  app.all("/api/ask-eco", sseEntry);
  app.all("/ask-eco", sseEntry);

  // --------------------------------------------------------------------------
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // popula req.guest e limita rate do modo convidado
  app.use(guestSessionMiddleware);

  app.use(normalizeQuery);

  app.get("/", (_req: Request, res: Response) => res.status(200).send("OK"));
  app.get("/healthz", (_req: Request, res: Response) =>
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
  );
  app.get("/readyz", (_req: Request, res: Response) => {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ status: "degraded", reason: "no-admin-config" });
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

  // Rotas (prefixo /api)
  app.use("/api", promptRoutes);                // inclui POST /api/ask-eco
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

  // 404
  app.use((req: Request, res: Response) => {
    const origin = req.headers.origin as string | undefined;
    ensureCorsHeaders(res, origin);
    res.status(404).json({ error: "Rota não encontrada", path: req.originalUrl });
  });

  // 500
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    ensureCorsHeaders(res, origin);
    if (req.method === "OPTIONS") return res.sendStatus(204);

    log.error("Erro não tratado:", {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
    });

    return res.status(500).json({ error: "Erro interno" });
  });

  return app;
}
