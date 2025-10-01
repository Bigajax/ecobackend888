"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleCatalog = void 0;
const ModuleStore_1 = require("./ModuleStore");
const logger_1 = require("./logger");
const STRICT_MISSING = process.env.ECO_STRICT_MODULES === "1";
class ModuleCatalog {
    static async ensureReady() {
        const anyStore = ModuleStore_1.ModuleStore;
        if (typeof anyStore.bootstrap === "function") {
            await anyStore.bootstrap();
            return;
        }
        await ModuleStore_1.ModuleStore.buildFileIndexOnce();
    }
    static async load(names) {
        const uniqueNames = Array.from(new Set(names));
        const candidates = await Promise.all(uniqueNames.map(async (name) => {
            const text = await this.require(name);
            const tokens = ModuleStore_1.ModuleStore.tokenCountOf(name, text);
            return { name, text, tokens };
        }));
        const candidateMap = new Map(candidates.map((candidate) => [candidate.name, candidate]));
        return names.map((name) => {
            const candidate = candidateMap.get(name);
            if (!candidate) {
                throw new Error(`Unexpected missing module candidate for ${name}`);
            }
            return candidate;
        });
    }
    static tokenCountOf(name, text) {
        return ModuleStore_1.ModuleStore.tokenCountOf(name, text);
    }
    static async require(name) {
        const found = await ModuleStore_1.ModuleStore.read(name);
        if (found && found.trim())
            return found;
        const msg = `[ContextBuilder] módulo ausente: ${name}`;
        if (STRICT_MISSING)
            throw new Error(msg);
        if ((0, logger_1.isDebug)())
            logger_1.log.debug(msg + " — usando vazio (dev/relaxado)");
        return "";
    }
}
exports.ModuleCatalog = ModuleCatalog;
//# sourceMappingURL=moduleCatalog.js.map