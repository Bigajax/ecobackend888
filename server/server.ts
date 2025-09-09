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

const DEV = process.env.NODE_ENV !== "production";

// ——— Origens permitidas
const FRONTEND_URL = (process.env.FRONTEND_URL || "").trim(); // ex: https://ecoapp.vercel.app
const vercelPreview = /^https?:\/\/[^/]*\.vercel\.app$/;
const localhost = /^http:\/\/localhost:\d+$/;
const loopback = /^http:\/\/127\.0\.0\.1:\d+$/;

function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true; // server-to-server
  if (DEV && (localhost.test(origin) || loopback.test(origin))) return true;
  if (FRONTEND_URL && origin === FRONTEND_URL) return true;
  if (vercelPreview.test(origin)) return true;
  return false;
}

// ——— Fallback CORS manual (resolve preflight em qualquer rota/erro)
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  const allowed = isAllowedOrigin(origin);

  if (allowed) {
    // reflete a origem quando houver, senão libera geral (sem cookies)
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Requested-With"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    // termina o preflight aqui com 204
    return res.status(204).end();
  }

  return next();
});

/* ---------------------------- Body parsing -------------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ------------------------------ Logger ------------------------------------ */
app.use((req, _res, next) => {
  // útil p/ debugar origem no Render
  const origin = req.headers.origin || "-";
  console.log(`Backend: [${req.method}] ${req.originalUrl} (Origin: ${origin})`);
  next();
});

/* ---------------------------- Healthcheck --------------------------------- */
app.get("/", (_req, res) => res.status(200).send("OK"));

/* -------------------------------- Rotas ----------------------------------- */
app.use("/api", promptRoutes);
app.use("/api/memorias", memoryRoutes);
app.use("/api/perfil-emocional", profileRoutes);
app.use("/api/voice", voiceTTSRoutes);
app.use("/api/voice", voiceFullRoutes);
app.use("/api", openrouterRoutes);
app.use("/api/relatorio-emocional", relatorioRoutes);
app.use("/api/feedback", feedbackRoutes);

/* ----------------------------- Inicialização ------------------------------ */
app.listen(PORT, async () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
  console.log("FRONTEND_URL:", FRONTEND_URL || "(não definido)");
  console.log("Modo DEV:", DEV);

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
