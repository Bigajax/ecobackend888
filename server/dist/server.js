"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/server.ts
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: process.env.DOTENV_PATH || path_1.default.resolve(__dirname, "../.env") });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const promptRoutes_1 = __importDefault(require("./routes/promptRoutes"));
const memoryRoutes_1 = __importDefault(require("./routes/memoryRoutes"));
const perfilEmocionalRoutes_1 = __importDefault(require("./routes/perfilEmocionalRoutes"));
const voiceTTSRoutes_1 = __importDefault(require("./routes/voiceTTSRoutes"));
const voiceFullRoutes_1 = __importDefault(require("./routes/voiceFullRoutes"));
const openrouterRoutes_1 = __importDefault(require("./routes/openrouterRoutes"));
const relatorioEmocionalRoutes_1 = __importDefault(require("./routes/relatorioEmocionalRoutes"));
const feedback_1 = __importDefault(require("./routes/feedback"));
const registrarTodasHeuristicas_1 = require("./services/registrarTodasHeuristicas");
const registrarModulosFilosoficos_1 = require("./services/registrarModulosFilosoficos");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 3001);
/* ----------------------------- CORS ----------------------------- */
/**
 * Allowlist padrão + regex para previews do Vercel.
 * Você pode adicionar mais origens via env:
 *   CORS_ALLOW_ORIGINS="https://minha.app,https://outra.com"
 */
const defaultAllow = [
    "https://ecofrontend888.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173", // ✅ adicionado
    "http://127.0.0.1:5173", // ✅ adicionado
];
const extraAllow = (process.env.CORS_ALLOW_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const allowList = new Set([...defaultAllow, ...extraAllow]);
// Permite qualquer subdomínio *.vercel.app
const vercelRegex = /^https?:\/\/([a-z0-9-]+)\.vercel\.app$/i;
const corsOptions = {
    origin(origin, cb) {
        // SSR/curl/health checks (sem Origin) → liberar
        if (!origin)
            return cb(null, true);
        if (allowList.has(origin) || vercelRegex.test(origin)) {
            return cb(null, true);
        }
        return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
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
app.use((0, cors_1.default)(corsOptions));
// Responde preflight para qualquer caminho
app.options("*", (0, cors_1.default)(corsOptions));
/* ------------------------- Body parsing ------------------------- */
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
/* ------------------------------ Log ---------------------------- */
app.use((req, _res, next) => {
    console.log(`Backend: [${req.method}] ${req.originalUrl} (Origin: ${req.headers.origin || "-"})`);
    next();
});
/* ------------------ Normalizador de query ---------------------- */
app.use((req, _res, next) => {
    const q = req.query;
    if (q && q.limite != null && q.limit == null)
        q.limit = q.limite;
    next();
});
/* -------------------------- Healthcheck ------------------------ */
app.get("/", (_req, res) => res.status(200).send("OK"));
/* ----------------------------- Rotas --------------------------- */
app.use("/api", promptRoutes_1.default);
app.use("/api/memorias", memoryRoutes_1.default);
app.use("/api/perfil-emocional", perfilEmocionalRoutes_1.default);
app.use("/api/voice", voiceTTSRoutes_1.default);
app.use("/api/voice", voiceFullRoutes_1.default);
app.use("/api", openrouterRoutes_1.default); // /api/ask-eco
app.use("/api/relatorio-emocional", relatorioEmocionalRoutes_1.default);
app.use("/api/feedback", feedback_1.default);
// Retrocompat (suporta chamadas antigas como /memorias/similares)
app.use("/memorias", memoryRoutes_1.default);
app.use("/perfil-emocional", perfilEmocionalRoutes_1.default);
app.use("/relatorio-emocional", relatorioEmocionalRoutes_1.default);
/* ----------------------- 404 & Error handler ------------------- */
// 404
app.use((req, res) => {
    // mantém CORS também em 404
    const origin = req.headers.origin;
    if (origin && (allowList.has(origin) || vercelRegex.test(origin))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.status(404).json({ error: "Rota não encontrada", path: req.originalUrl });
});
// Error handler
app.use((err, req, res, _next) => {
    console.error("Erro não tratado:", err);
    // garante headers CORS também em erros
    const origin = req.headers.origin;
    if (origin && (allowList.has(origin) || vercelRegex.test(origin))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    // Se for preflight que caiu aqui, devolve 204
    if (req.method === "OPTIONS")
        return res.sendStatus(204);
    res.status(500).json({ error: "Erro interno" });
});
/* ---------------------------- Start ---------------------------- */
app.listen(PORT, async () => {
    console.log(`Servidor Express rodando na porta ${PORT}`);
    console.log("CORS allowlist:", Array.from(allowList).join(", "));
    if (process.env.REGISTRAR_HEURISTICAS === "true") {
        await (0, registrarTodasHeuristicas_1.registrarTodasHeuristicas)();
        console.log("🎯 Heurísticas registradas.");
    }
    if (process.env.REGISTRAR_FILOSOFICOS === "true") {
        await (0, registrarModulosFilosoficos_1.registrarModulosFilosoficos)();
        console.log("🧘 Módulos filosóficos registrados.");
    }
});
exports.default = app;
//# sourceMappingURL=server.js.map