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
// Ajuste aqui seus domínios de produção/dev
const ALLOWED_ORIGINS = [
  "https://ecofrontend888-6zx44bft2-rafaels-projects-f3ef53c3.vercel.app",
  "http://localhost:5173",
];

// Se o front NÃO usa cookies/sessão (apenas Bearer), deixe false
const ALLOW_CREDENTIALS = false;

app.use(
  cors({
    origin(origin, cb) {
      // permite tools tipo curl/Postman (sem Origin)
      if (!origin) return cb(null, true);
      cb(null, ALLOWED_ORIGINS.includes(origin));
    },
    credentials: ALLOW_CREDENTIALS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With"],
    maxAge: 86400,
  })
);

// Responde preflight explicitamente para qualquer rota
app.options("*", cors());

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
app.use("/api", openrouterRoutes);                  // /api/ask-eco está aqui
app.use("/api/relatorio-emocional", relatorioRoutes);
app.use("/api/feedback", feedbackRoutes);

// retrocompat
app.use("/memorias", memoryRoutes);
app.use("/perfil-emocional", profileRoutes);
app.use("/relatorio-emocional", relatorioRoutes);

/* ----------------------- 404 & Error handler ------------------- */
// IMPORTANTE: ainda retorna com CORS (o middleware já rodou)
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
