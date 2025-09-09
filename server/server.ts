// server/src/server.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({
  // garante que funcione rodando em ts-node (src) e no build (dist)
  path: process.env.DOTENV_PATH || path.resolve(__dirname, "../.env"),
});

import express from "express";

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
// use a mesma porta que o seu front está apontando; ajuste se precisar
const PORT = Number(process.env.PORT || 3001);

/* ------------------------------------------------------------------ */
/*  CORS GLOBAL (permite tudo – sem cookies)                           */
/*  Segurança ok: autenticação via Bearer token em Authorization       */
/* ------------------------------------------------------------------ */
app.use((req, res, next) => {
  res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

/* --------------------------- Body parsing --------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ------------------------------ Log -------------------------------- */
app.use((req, _res, next) => {
  const origin = req.headers.origin || "-";
  console.log(`Backend: [${req.method}] ${req.originalUrl}  (Origin: ${origin})`);
  next();
});

/* ------------- Normalizador de query (alias & defaults) ------------- */
// Ex.: aceita ?limite=600 como se fosse ?limit=600
app.use((req, _res, next) => {
  const q = req.query as Record<string, any>;
  if (q && q.limite != null && q.limit == null) q.limit = q.limite;
  next();
});

/* ---------------------------- Healthcheck --------------------------- */
app.get("/", (_req, res) => res.status(200).send("OK"));

/* ------------------------------- Rotas ------------------------------ */
// Padrão novo (com prefixo /api)
app.use("/api", promptRoutes);
app.use("/api/memorias", memoryRoutes);
app.use("/api/perfil-emocional", profileRoutes);
app.use("/api/voice", voiceTTSRoutes);
app.use("/api/voice", voiceFullRoutes);
app.use("/api", openrouterRoutes);
app.use("/api/relatorio-emocional", relatorioRoutes);
app.use("/api/feedback", feedbackRoutes);

// 🔁 Compatibilidade retroativa (sem /api) — cobre chamadas como /memorias, /perfil-emocional, /relatorio-emocional
app.use("/memorias", memoryRoutes);
app.use("/perfil-emocional", profileRoutes);
app.use("/relatorio-emocional", relatorioRoutes);

/* ------------------------- 404 & Error handler ---------------------- */
app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada", path: req.originalUrl });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Erro não tratado:", err);
  res.status(500).json({ error: "Erro interno" });
});

/* ----------------------------- Inicializa --------------------------- */
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
