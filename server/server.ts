// server/src/server.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: process.env.DOTENV_PATH || path.resolve(__dirname, "../.env") });

import express from "express";
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
/** Sem cookies/sessão => credenciais desativadas.
 *  Não fixe allowedHeaders/methods: o pacote cors reflete o que o browser pedir.
 */
app.use(
  cors({
    origin: (_origin, cb) => cb(null, true), // aceita qualquer origem
    credentials: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  })
);

// responde preflight de qualquer rota rapidamente
app.options("*", cors());

/* Cinto + suspensório: se algum handler retornar 4xx/5xx sem passar pelo cors(),
   garanta os headers básicos mesmo assim. */
app.use((req, res, next) => {
  if (!res.getHeader("Access-Control-Allow-Origin")) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
    // ecoa os headers solicitados no preflight (ou um mínimo seguro)
    const reqHdr = (req.headers["access-control-request-headers"] as string) || "authorization,content-type,accept";
    res.setHeader("Access-Control-Allow-Headers", reqHdr);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

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
app.get("/", (_req, res) => res.status(200).send("OK"));

/* ----------------------------- Rotas --------------------------- */
app.use("/api", promptRoutes);
app.use("/api/memorias", memoryRoutes);
app.use("/api/perfil-emocional", profileRoutes);
app.use("/api/voice", voiceTTSRoutes);
app.use("/api/voice", voiceFullRoutes);
app.use("/api", openrouterRoutes); // /api/ask-eco
app.use("/api/relatorio-emocional", relatorioRoutes);
app.use("/api/feedback", feedbackRoutes);

// retrocompat
app.use("/memorias", memoryRoutes);
app.use("/perfil-emocional", profileRoutes);
app.use("/relatorio-emocional", relatorioRoutes);

/* ----------------------- 404 & Error handler ------------------- */
app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada", path: req.originalUrl });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Erro não tratado:", err);
  res.status(500).json({ error: "Erro interno" });
});

/* ---------------------------- Start ---------------------------- */
app.listen(PORT, async () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
  if (process.env.REGISTRAR_HEURISTICAS === "true") {
    await registrarTodasHeuristicas();  console.log("🎯 Heurísticas registradas.");
  }
  if (process.env.REGISTRAR_FILOSOFICOS === "true") {
    await registrarModulosFilosoficos(); console.log("🧘 Módulos filosóficos registrados.");
  }
});

export default app;
