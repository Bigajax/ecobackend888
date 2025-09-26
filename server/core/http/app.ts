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

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);

  applyCors(app);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);
  app.use(normalizeQuery);

  app.get("/", (_req: Request, res: Response) => res.status(200).send("OK"));
  app.get("/healthz", (_req: Request, res: Response) => res.status(200).json({ status: "ok" }));
  app.get("/readyz", (_req: Request, res: Response) => res.status(200).json({ ready: true }));

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

  app.use("/api", promptRoutes);
  app.use("/api/memorias", memoryRoutes);
  app.use("/api/perfil-emocional", profileRoutes);
  app.use("/api/voice", voiceTTSRoutes);
  app.use("/api/voice", voiceFullRoutes);
  app.use("/api", openrouterRoutes);
  app.use("/api/relatorio-emocional", relatorioRoutes);
  app.use("/api/feedback", feedbackRoutes);

  app.use("/memorias", memoryRoutes);
  app.use("/perfil-emocional", profileRoutes);
  app.use("/relatorio-emocional", relatorioRoutes);

  app.use((req: Request, res: Response) => {
    const origin = req.headers.origin as string | undefined;
    ensureCorsHeaders(res, origin);
    res.status(404).json({ error: "Rota não encontrada", path: req.originalUrl });
  });

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
