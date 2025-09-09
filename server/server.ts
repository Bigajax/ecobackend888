// server/src/server.ts
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

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
const PORT = process.env.PORT || 3001;

/* ------------------------------------------------------------------ */
/*  CORS GLOBAL (permite tudo – sem cookies)                           */
/*  Segurança: ok porque usamos somente Bearer no header Authorization */
/* ------------------------------------------------------------------ */
app.use((req, res, next) => {
  // Sempre setar os headers antes de qualquer resposta
  res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  res.setHeader("Access-Control-Allow-Origin", "*"); // aberto – sem cookies
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Requested-With"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    // Preflight: termina aqui com 204 e zero bytes
    return res.status(204).end();
  }
  return next();
});

/* --------------------------- Body parsing --------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ------------------------------- Log -------------------------------- */
app.use((req, _res, next) => {
  const origin = req.headers.origin || "-";
  console.log(`Backend: [${req.method}] ${req.originalUrl}  (Origin: ${origin})`);
  next();
});

/* ---------------------------- Healthcheck --------------------------- */
app.get("/", (_req, res) => res.status(200).send("OK"));

/* ------------------------------- Rotas ------------------------------ */
app.use("/api", promptRoutes);
app.use("/api/memorias", memoryRoutes);
app.use("/api/perfil-emocional", profileRoutes);
app.use("/api/voice", voiceTTSRoutes);
app.use("/api/voice", voiceFullRoutes);
app.use("/api", openrouterRoutes);
app.use("/api/relatorio-emocional", relatorioRoutes);
app.use("/api/feedback", feedbackRoutes);

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
