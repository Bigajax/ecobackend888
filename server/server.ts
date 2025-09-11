// server/src/server.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: process.env.DOTENV_PATH || path.resolve(__dirname, "../.env") });

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

import promptRoutes from "./routes/promptRoutes";
import memoryRoutes from "./routes/memoryRoutes";
import profileRoutes from "./routes/perfilEmocionalRoutes";
import voiceTTSRoutes from "./routes/voiceTTSRoutes";
import voiceFullRoutes from "./routes/voiceFullRoutes";
import openrouterRoutes from "./routes/openrouterRoutes";
import relatorioRoutes from "./routes/relatorioEmocionalRoutes";
import feedbackRoutes from "./routes/feedback";

import { registrarTodasHeuristicas } from "./services/registrarTodasHeuristicas";
import { registrarModulosFilosoficos } from "./services/registrarModulosFilosoficos";

const app = express();
const PORT = Number(process.env.PORT || 3001);

/* ----------------------------- CORS ----------------------------- */
/**
 * Allowlist: domínio principal do Vercel + localhost, com regex para previews (*.vercel.app).
 * Você pode adicionar mais origens via env: CORS_ALLOW_ORIGINS="https://minha.app,https://outra.com"
 */
const defaultAllow = [
  "https://ecofrontend888.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const extraAllow =
  (process.env.CORS_ALLOW_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) || [];

const allowList = new Set<string>([...defaultAllow, ...extraAllow]);
const vercelRegex = /^https?:\/\/([a-z0-9-]+)\.vercel\.app$/i;

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // SSR/curl/etc. (sem Origin) → libera
    if (!origin) return cb(null, true);
    if (allowList.has(origin) || vercelRegex.test(origin)) {
      return cb(null, true); // o pacote cors reflete a origem automaticamente
    }
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true, // seguro, pois não usamos "*" e refletimos a origem
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  optionsSuccessStatus: 204,
  maxAge: 86400, // cache do preflight por 24h
};

// Cabeçalhos de Vary para caches (CDN/proxy) tratarem CORS corretamente
app.use((req, res, next) => {
  res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  next();
});

// Aplica CORS antes de qualquer rota
app.use(cors(corsOptions));
// Responde preflight para qualquer caminho
app.options("*", cors(corsOptions));

/* ------------------------- Body parsing ------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ------------------------------ Log ---------------------------- */
app.use((req, _res, next) => {
  console.log(`Backend: [${req.method}] ${req.originalUrl} (Origin: ${req.headers.origin || "-"})`);
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

/* ----------------------------- Rotas --------------------------- */
app.use("/api", promptRoutes);
app.use("/api/memorias", memoryRoutes);
app.use("/api/perfil-emocional", profileRoutes);
app.use("/api/voice", voiceTTSRoutes);
app.use("/api/voice", voiceFullRoutes);
app.use("/api", openrouterRoutes); // /api/ask-eco
app.use("/api/relatorio-emocional", relatorioRoutes);
app.use("/api/feedback", feedbackRoutes);

// Retrocompat (suporta chamadas antigas como /memorias/similares)
app.use("/memorias", memoryRoutes);
app.use("/perfil-emocional", profileRoutes);
app.use("/relatorio-emocional", relatorioRoutes);

/* ----------------------- 404 & Error handler ------------------- */
// 404
app.use((req: Request, res: Response) => {
  // mantém CORS também em 404
  const origin = req.headers.origin as string | undefined;
  if (origin && (allowList.has(origin) || vercelRegex.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.status(404).json({ error: "Rota não encontrada", path: req.originalUrl });
});

// Error handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("Erro não tratado:", err);
  // garante headers CORS também em erros
  const origin = req.headers.origin as string | undefined;
  if (origin && (allowList.has(origin) || vercelRegex.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  // Se for preflight que caiu aqui, devolve 204
  if (req.method === "OPTIONS") return res.sendStatus(204);
  res.status(500).json({ error: "Erro interno" });
});

/* ---------------------------- Start ---------------------------- */
app.listen(PORT, async () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
  if (process.env.REGISTRAR_HEURISTICAS === "true") {
    await registrarTodasHeuristicas();
    console.log("🎯 Heurísticas registradas.");
  }
  if (process.env.REGISTRAR_FILOSOFICOS === "true") {
    await registrarModulosFilosoficos();
    console.log("🧘 Módulos filosóficos registrados.");
  }
});

export default app;
