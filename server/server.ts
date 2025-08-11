// server/src/server.ts (ou server.ts)

import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import express from "express";
import cors from "cors";

import promptRoutes from "./routes/promptRoutes";
import memoryRoutes from "./routes/memoryRoutes";
import profileRoutes from "./routes/perfilEmocionalRoutes";
import voiceTTSRoutes from "./routes/voiceTTSRoutes";
import voiceFullRoutes from "./routes/voiceFullRoutes";
import openrouterRoutes from "./routes/openrouterRoutes";
import relatorioRoutes from "./routes/relatorioEmocionalRoutes";

import { registrarTodasHeuristicas } from "./services/registrarTodasHeuristicas";
import { registrarModulosFilosoficos } from "./services/registrarModulosFilosoficos";

const app = express();
const PORT = process.env.PORT || 3001;

/* ----------------------------- C O R S  ---------------------------------- */
// Lista de origens permitidas (string exata e regex p/ previews do Vercel)
const ALLOWED_ORIGINS: (string | RegExp)[] = [
  process.env.FRONTEND_URL as string,        // ex.: https://ecofrontend888.vercel.app
  /^https?:\/\/[^/]*\.vercel\.app$/,         // qualquer preview do Vercel
  "http://localhost:5173",                   // dev local
].filter(Boolean) as (string | RegExp)[];

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // chamadas server-to-server (sem Origin) → libera
    if (!origin) return cb(null, true);
    const ok = ALLOWED_ORIGINS.some((o) =>
      typeof o === "string" ? o === origin : o.test(origin)
    );
    return cb(ok ? null : new Error(`CORS: origin não permitido: ${origin}`), ok);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  // Não usamos cookies; só Bearer → mantenha false (evita dor de cabeça)
  credentials: false,
  maxAge: 86400, // cache do preflight
};

// ⚠️ O CORS precisa vir ANTES de qualquer rota/middleware de auth
app.use(cors(corsOptions));
// Responde preflight para tudo
app.options("*", cors(corsOptions));

/* ---------------------------- Body parsing -------------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ------------------------------ Logger ------------------------------------ */
app.use((req, _res, next) => {
  console.log(`Backend: [${req.method}] ${req.originalUrl}`);
  next();
});

// Healthcheck simples (útil para testar CORS com GET)
app.get("/", (_req, res) => res.status(200).send("OK"));

/* -------------------------------- Rotas ----------------------------------- */
app.use("/api", promptRoutes);
app.use("/api/memorias", memoryRoutes);
app.use("/api/perfil-emocional", profileRoutes);
app.use("/api/voice", voiceTTSRoutes);
app.use("/api/voice", voiceFullRoutes);
app.use("/api", openrouterRoutes);
app.use("/api/relatorio-emocional", relatorioRoutes);

/* ----------------------------- Inicialização ------------------------------ */
app.listen(PORT, async () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
  console.log("CORS permitido para:", ALLOWED_ORIGINS);

  if (process.env.REGISTRAR_HEURISTICAS === "true") {
    await registrarTodasHeuristicas();
    console.log("🎯 Registro de heurísticas finalizado (executado conforme .env)");
  }

  if (process.env.REGISTRAR_FILOSOFICOS === "true") {
    await registrarModulosFilosoficos();
    console.log("🧘 Registro de módulos filosóficos finalizado (executado conforme .env)");
  }
});

export default app;
