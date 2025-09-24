// server/src/server.ts
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// ---------- Carregamento .env robusto (dist-friendly) ----------
(function loadEnv() {
  const explicit = process.env.DOTENV_PATH;
  if (explicit && fs.existsSync(explicit)) {
    dotenv.config({ path: explicit });
    return;
  }

  const tryPaths = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const p of tryPaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }
})();

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

// Rotas
import promptRoutes from "./routes/promptRoutes";
import memoryRoutes from "./routes/memoryRoutes";
import profileRoutes from "./routes/perfilEmocionalRoutes";
import voiceTTSRoutes from "./routes/voiceTTSRoutes";
import voiceFullRoutes from "./routes/voiceFullRoutes";
import openrouterRoutes from "./routes/openrouterRoutes";
import relatorioRoutes from "./routes/relatorioEmocionalRoutes";
import feedbackRoutes from "./routes/feedback";

// Jobs de registro (imports **default**)
import registrarTodasHeuristicas from "./services/registrarTodasHeuristicas";
import registrarModulosFilosoficos from "./services/registrarModulosFilosoficos";

// Logger
import { log } from "./services/promptContext/logger";

const app = express();
const PORT = Number(process.env.PORT || 3001);

// Render/Proxies (X-Forwarded-*)
app.set("trust proxy", 1);

/* ----------------------------- CORS ----------------------------- */
const defaultAllow = [
  "https://ecofrontend888.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const extraAllow = (process.env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowList = new Set<string>([...defaultAllow, ...extraAllow]);

// Permite qualquer subdomínio *.vercel.app
const vercelRegex = /^https?:\/\/([a-z0-9-]+)\.vercel\.app$/i;

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // SSR/curl/health checks (sem Origin) → liberar
    if (!origin) return cb(null, true);

    if (allowList.has(origin) || vercelRegex.test(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  optionsSuccessStatus: 204,
  maxAge: 86400, // 24h
};

// Vary para caches tratarem CORS corretamente
app.use((req, res, next) => {
  res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  next();
});

// Aplica CORS antes de qualquer rota
app.use(cors(corsOptions));
// Responde preflight para qualquer caminho
app.options("*", cors(corsOptions));

/* ------------------------- Body parsing ------------------------- */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ------------------------------ Log ---------------------------- */
app.use((req, _res, next) => {
  log.info(`Backend: [${req.method}] ${req.originalUrl} (Origin: ${req.headers.origin || "-"})`);
  next();
});

/* ------------------ Normalizador de query ---------------------- */
app.use((req, _res, next) => {
  const q = req.query as Record<string, any>;
  if (q && q.limite != null && q.limit == null) q.limit = q.limite;
  next();
});

/* -------------------------- Healthcheck ------------------------ */
app.get("/", (_req: Request, res: Response) => res.status(200).send("OK"));
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/readyz", (_req, res) => res.status(200).json({ ready: true }));

/* ----------------------------- Rotas --------------------------- */
app.use("/api", promptRoutes);
app.use("/api/memorias", memoryRoutes);
app.use("/api/perfil-emocional", profileRoutes);
app.use("/api/voice", voiceTTSRoutes);
app.use("/api/voice", voiceFullRoutes);
app.use("/api", openrouterRoutes); // /api/ask-eco
app.use("/api/relatorio-emocional", relatorioRoutes);
app.use("/api/feedback", feedbackRoutes);

// Retrocompat
app.use("/memorias", memoryRoutes);
app.use("/perfil-emocional", profileRoutes);
app.use("/relatorio-emocional", relatorioRoutes);

/* ----------------------- 404 & Error handler ------------------- */
// 404
app.use((req: Request, res: Response) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && (allowList.has(origin) || vercelRegex.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.status(404).json({ error: "Rota não encontrada", path: req.originalUrl });
});

// Error handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && (allowList.has(origin) || vercelRegex.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);

  log.error("Erro não tratado:", {
    message: err?.message,
    stack: err?.stack,
    name: err?.name,
  });

  res.status(500).json({ error: "Erro interno" });
});

/* ---------------------------- Start ---------------------------- */
app.listen(PORT, async () => {
  log.info(`Servidor Express rodando na porta ${PORT}`);
  log.info("CORS allowlist:", Array.from(allowList).join(", "));
  log.info("Boot", {
    ECO_LOG_LEVEL: process.env.ECO_LOG_LEVEL ?? "(unset)",
    ECO_DEBUG: process.env.ECO_DEBUG ?? "(unset)",
    NODE_ENV: process.env.NODE_ENV ?? "(unset)",
  });

  try {
    if (process.env.REGISTRAR_HEURISTICAS === "true") {
      await registrarTodasHeuristicas();
      log.info("🎯 Heurísticas registradas.");
    }
    if (process.env.REGISTRAR_FILOSOFICOS === "true") {
      await registrarModulosFilosoficos();
      log.info("🧘 Módulos filosóficos registrados.");
    }
  } catch (e: any) {
    log.error("Falha ao registrar recursos iniciais:", { message: e?.message, stack: e?.stack });
  }
});

export default app;
