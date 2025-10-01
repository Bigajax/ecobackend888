"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultContextCache = exports.ContextCache = void 0;
const CacheService_1 = require("../CacheService");
const promptContext_1 = require("../promptContext");
const Selector_1 = require("../promptContext/Selector");
const logger_1 = require("../promptContext/logger");
class ContextCache {
    deps;
    constructor(deps = {
        cache: CacheService_1.PROMPT_CACHE,
        builder: promptContext_1.ContextBuilder,
        logger: logger_1.log,
        debug: logger_1.isDebug,
    }) {
        this.deps = deps;
    }
    async build(params) {
        const entrada = String(params.texto ?? "");
        const saudacaoBreve = (0, Selector_1.detectarSaudacaoBreve)(entrada);
        const nivel = (0, Selector_1.derivarNivel)(entrada, saudacaoBreve);
        const intensidade = Math.max(0, ...(params.mems ?? []).map((m) => Number(m?.intensidade ?? 0)));
        const msCount = Array.isArray(params.memoriasSemelhantes)
            ? params.memoriasSemelhantes.length
            : 0;
        const vivaFlag = params.forcarMetodoViva ? "1" : "0";
        const derivadosFlag = params.derivados ? "1" : "0";
        const aberturaFlag = params.aberturaHibrida ? "1" : "0";
        const heuristicasFlag = Array.isArray(params.heuristicas)
            ? params.heuristicas.length > 0
                ? "1"
                : "0"
            : params.heuristicas
                ? "1"
                : "0";
        const embeddingFlag = Array.isArray(params.userEmbedding)
            ? params.userEmbedding.length > 0
                ? "1"
                : "0"
            : params.userEmbedding
                ? "1"
                : "0";
        const cacheKey = `ctx:${params.userId || "anon"}:${nivel}:${Math.round(intensidade)}:ms${msCount}:v${vivaFlag}:d${derivadosFlag}:a${aberturaFlag}:h${heuristicasFlag}:e${embeddingFlag}`;
        const cachedBase = this.deps.cache.get(cacheKey);
        if (cachedBase && msCount === 0) {
            if (this.deps.debug()) {
                this.deps.logger.debug("[Orchestrator] contexto via cache", { cacheKey });
            }
            return this.deps.builder.montarMensagemAtual(cachedBase, entrada);
        }
        const t0 = Date.now();
        const contexto = await this.deps.builder.build(params);
        const prompt = contexto.montarMensagemAtual(entrada);
        if (this.deps.debug()) {
            this.deps.logger.debug("[Orchestrator] contexto construído", {
                ms: Date.now() - t0,
            });
        }
        if (nivel <= 2 && msCount === 0) {
            this.deps.cache.set(cacheKey, contexto.base);
        }
        return prompt;
    }
}
exports.ContextCache = ContextCache;
exports.defaultContextCache = new ContextCache();
//# sourceMappingURL=contextCache.js.map