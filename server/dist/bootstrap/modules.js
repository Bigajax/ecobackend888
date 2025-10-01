"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureModuleStore = configureModuleStore;
exports.bootstrap = bootstrap;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ModuleCatalog_1 = require("../domains/prompts/ModuleCatalog");
const logger_1 = require("../services/promptContext/logger");
function dirIfExists(p) {
    try {
        return fs_1.default.statSync(p).isDirectory() ? p : null;
    }
    catch {
        return null;
    }
}
/**
 * Define as roots de módulos (txt/md) e constrói o índice.
 * - Suporta override por env ECO_MODULES_DIR (lista separada por vírgula).
 * - Procura em dev: server/assets/... **e** assets/...
 * - Procura em prod: dist/assets/...
 */
async function configureModuleStore() {
    const CWD = process.cwd();
    // 1) Override por env (opcional)
    const envRoots = (process.env.ECO_MODULES_DIR || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((p) => (path_1.default.isAbsolute(p) ? p : path_1.default.join(CWD, p)))
        .map(dirIfExists)
        .filter(Boolean);
    // 2) DEV: suportar tanto server/assets quanto assets (raiz)
    const devRootsServer = [
        path_1.default.join(CWD, "server", "assets", "modulos_core"),
        path_1.default.join(CWD, "server", "assets", "modulos_cognitivos"),
        path_1.default.join(CWD, "server", "assets", "modulos_emocionais"),
        path_1.default.join(CWD, "server", "assets", "modulos_extras"),
        path_1.default.join(CWD, "server", "assets", "modulos_filosoficos"),
    ].map(dirIfExists).filter(Boolean);
    const devRootsRoot = [
        path_1.default.join(CWD, "assets", "modulos_core"),
        path_1.default.join(CWD, "assets", "modulos_cognitivos"),
        path_1.default.join(CWD, "assets", "modulos_emocionais"),
        path_1.default.join(CWD, "assets", "modulos_extras"),
        path_1.default.join(CWD, "assets", "modulos_filosoficos"),
    ].map(dirIfExists).filter(Boolean);
    // 3) PROD: o script copy:assets envia para dist/assets/...
    const distRoots = [
        path_1.default.join(CWD, "dist", "assets", "modulos_core"),
        path_1.default.join(CWD, "dist", "assets", "modulos_cognitivos"),
        path_1.default.join(CWD, "dist", "assets", "modulos_emocionais"),
        path_1.default.join(CWD, "dist", "assets", "modulos_extras"),
        path_1.default.join(CWD, "dist", "assets", "modulos_filosoficos"),
    ].map(dirIfExists).filter(Boolean);
    // Prioridade: env → dist → dev(server) → dev(root)
    const roots = [...envRoots, ...distRoots, ...devRootsServer, ...devRootsRoot];
    ModuleCatalog_1.ModuleCatalog.configure(roots);
    await ModuleCatalog_1.ModuleCatalog.buildFileIndexOnce();
    logger_1.log.info("[ModuleStore.bootstrap] configurado", {
        roots,
        // mostra até 10 itens só pra sinalizar que indexou
        indexedPeek: ModuleCatalog_1.ModuleCatalog.listIndexed(10),
    });
    if (roots.length === 0) {
        logger_1.log.warn("[ModuleStore.bootstrap] nenhum diretório de módulos encontrado — usaremos fallbacks inline quando possível. " +
            "Verifique seu copy:assets ou configure ECO_MODULES_DIR.");
    }
}
/** Alias conveniente */
async function bootstrap() {
    return configureModuleStore();
}
// 🔁 Compatibilidade com chamadas existentes: ModuleStore.bootstrap()
;
ModuleCatalog_1.ModuleCatalog.bootstrap = configureModuleStore;
exports.default = configureModuleStore;
//# sourceMappingURL=modules.js.map