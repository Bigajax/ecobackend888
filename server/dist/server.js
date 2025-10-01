"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
(function loadEnv() {
    const explicit = process.env.DOTENV_PATH;
    if (explicit && fs_1.default.existsSync(explicit)) {
        dotenv_1.default.config({ path: explicit });
        return;
    }
    const tryPaths = [
        path_1.default.resolve(__dirname, "../.env"),
        path_1.default.resolve(__dirname, "../../.env"),
        path_1.default.resolve(process.cwd(), ".env"),
    ];
    for (const p of tryPaths) {
        if (fs_1.default.existsSync(p)) {
            dotenv_1.default.config({ path: p });
            return;
        }
    }
})();
const app_1 = require("./core/http/app");
const cors_1 = require("./core/http/middlewares/cors");
const modules_1 = require("./bootstrap/modules");
const registrarTodasHeuristicas_1 = __importDefault(require("./services/registrarTodasHeuristicas"));
const registrarModulosFilosoficos_1 = __importDefault(require("./services/registrarModulosFilosoficos"));
const logger_1 = require("./services/promptContext/logger");
const app = (0, app_1.createApp)();
async function start() {
    await (0, modules_1.configureModuleStore)();
    const PORT = Number(process.env.PORT || 3001);
    app.listen(PORT, async () => {
        logger_1.log.info(`Servidor Express rodando na porta ${PORT}`);
        logger_1.log.info("CORS allowlist:", Array.from((0, cors_1.getAllowList)()).join(", "));
        logger_1.log.info("Boot", {
            ECO_LOG_LEVEL: process.env.ECO_LOG_LEVEL ?? "(unset)",
            ECO_DEBUG: process.env.ECO_DEBUG ?? "(unset)",
            NODE_ENV: process.env.NODE_ENV ?? "(unset)",
        });
        try {
            if (process.env.REGISTRAR_HEURISTICAS === "true") {
                await (0, registrarTodasHeuristicas_1.default)();
                logger_1.log.info("🎯 Heurísticas registradas.");
            }
            if (process.env.REGISTRAR_FILOSOFICOS === "true") {
                await (0, registrarModulosFilosoficos_1.default)();
                logger_1.log.info("🧘 Módulos filosóficos registrados.");
            }
        }
        catch (error) {
            logger_1.log.error("Falha ao registrar recursos iniciais:", { message: error?.message, stack: error?.stack });
        }
    });
}
process.on("unhandledRejection", (reason) => {
    logger_1.log.error("unhandledRejection", { reason });
});
process.on("uncaughtException", (err) => {
    logger_1.log.error("uncaughtException", { message: err.message, stack: err.stack });
});
start().catch((error) => {
    logger_1.log.error("Falha no boot do servidor:", { message: error?.message, stack: error?.stack });
    process.exitCode = 1;
});
exports.default = app;
//# sourceMappingURL=server.js.map