"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = require("./middlewares/cors");
const logger_1 = require("./middlewares/logger");
const queryNormalizer_1 = require("./middlewares/queryNormalizer");
const ModuleCatalog_1 = require("../../domains/prompts/ModuleCatalog");
const promptRoutes_1 = __importDefault(require("../../routes/promptRoutes"));
const perfilEmocionalRoutes_1 = __importDefault(require("../../routes/perfilEmocionalRoutes"));
const voiceTTSRoutes_1 = __importDefault(require("../../routes/voiceTTSRoutes"));
const voiceFullRoutes_1 = __importDefault(require("../../routes/voiceFullRoutes"));
const openrouterRoutes_1 = __importDefault(require("../../routes/openrouterRoutes"));
const relatorioEmocionalRoutes_1 = __importDefault(require("../../routes/relatorioEmocionalRoutes"));
const feedback_1 = __importDefault(require("../../routes/feedback"));
const routes_1 = __importDefault(require("../../domains/memory/routes"));
const logger_2 = require("../../services/promptContext/logger");
function createApp() {
    const app = (0, express_1.default)();
    app.set("trust proxy", 1);
    (0, cors_1.applyCors)(app);
    app.use(express_1.default.json({ limit: "1mb" }));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use(logger_1.requestLogger);
    app.use(queryNormalizer_1.normalizeQuery);
    app.get("/", (_req, res) => res.status(200).send("OK"));
    app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));
    app.get("/readyz", (_req, res) => res.status(200).json({ ready: true }));
    app.get("/debug/modules", (_req, res) => {
        const stats = ModuleCatalog_1.ModuleCatalog.stats();
        res.json({
            roots: stats.roots,
            indexedCount: stats.indexedCount,
            cachedCount: stats.cachedCount,
            built: stats.built,
            sample: ModuleCatalog_1.ModuleCatalog.listIndexed(50),
        });
    });
    app.use("/api", promptRoutes_1.default);
    app.use("/api/memorias", routes_1.default);
    app.use("/api/memories", routes_1.default);
    app.use("/api/perfil-emocional", perfilEmocionalRoutes_1.default);
    app.use("/api/v1/perfil-emocional", perfilEmocionalRoutes_1.default);
    app.use("/api/voice", voiceTTSRoutes_1.default);
    app.use("/api/voice", voiceFullRoutes_1.default);
    app.use("/api", openrouterRoutes_1.default);
    app.use("/api/relatorio-emocional", relatorioEmocionalRoutes_1.default);
    app.use("/api/v1/relatorio-emocional", relatorioEmocionalRoutes_1.default);
    app.use("/api/feedback", feedback_1.default);
    app.use("/memorias", routes_1.default);
    app.use("/memories", routes_1.default);
    app.use("/perfil-emocional", perfilEmocionalRoutes_1.default);
    app.use("/relatorio-emocional", relatorioEmocionalRoutes_1.default);
    app.use((req, res) => {
        const origin = req.headers.origin;
        (0, cors_1.ensureCorsHeaders)(res, origin);
        res.status(404).json({ error: "Rota não encontrada", path: req.originalUrl });
    });
    app.use((err, req, res, _next) => {
        const origin = req.headers.origin;
        (0, cors_1.ensureCorsHeaders)(res, origin);
        if (req.method === "OPTIONS")
            return res.sendStatus(204);
        logger_2.log.error("Erro não tratado:", {
            message: err?.message,
            stack: err?.stack,
            name: err?.name,
        });
        return res.status(500).json({ error: "Erro interno" });
    });
    return app;
}
//# sourceMappingURL=app.js.map