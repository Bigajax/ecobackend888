"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultParallelFetchService = exports.ParallelFetchService = void 0;
exports.withTimeoutOrNull = withTimeoutOrNull;
const logger_1 = require("../promptContext/logger");
const EmbeddingAdapter_1 = require("../../adapters/EmbeddingAdapter");
const heuristicaService_1 = require("../../services/heuristicaService");
const buscarMemorias_1 = require("../../services/buscarMemorias");
class ParallelFetchService {
    deps;
    constructor(deps = {
        getEmbedding: EmbeddingAdapter_1.getEmbeddingCached,
        getHeuristicas: heuristicaService_1.buscarHeuristicasSemelhantes,
        getMemorias: buscarMemorias_1.buscarMemoriasSemelhantes,
        logger: logger_1.log,
        debug: logger_1.isDebug,
    }) {
        this.deps = deps;
    }
    async run({ ultimaMsg, userId, supabase }) {
        let userEmbedding = [];
        const trimmed = (ultimaMsg || "").trim();
        if (trimmed.length > 0) {
            try {
                userEmbedding = await this.deps.getEmbedding(trimmed, "entrada_usuario");
            }
            catch (e) {
                userEmbedding = [];
                this.deps.logger.warn(`[ParallelFetch] getEmbedding falhou: ${e?.message ?? "erro desconhecido"}`);
            }
        }
        let heuristicas = [];
        let memsSemelhantes = [];
        if (userEmbedding.length > 0) {
            const heuristicasPromise = this.deps
                .getHeuristicas({
                usuarioId: userId ?? null,
                userEmbedding,
                matchCount: 4, // LATENCY: top_k
            })
                .catch(() => []);
            const memsPromise = userId
                ? this.deps
                    .getMemorias(userId, {
                    // Reuse the embedding computed above to avoid duplicate embedding API calls.
                    texto: trimmed,
                    userEmbedding,
                    k: 3,
                    threshold: 0.12,
                    supabaseClient: supabase,
                })
                    .catch((e) => {
                    if (this.deps.debug()) {
                        this.deps.logger.warn(`[ParallelFetch] buscarMemoriasSemelhantes falhou: ${e?.message}`);
                    }
                    return [];
                })
                : Promise.resolve([]);
            const [heuristicasResult, memsResult] = await Promise.all([
                heuristicasPromise,
                memsPromise,
            ]);
            heuristicas = heuristicasResult ?? [];
            memsSemelhantes = userId ? memsResult ?? [] : [];
        }
        return { heuristicas, userEmbedding, memsSemelhantes };
    }
}
exports.ParallelFetchService = ParallelFetchService;
async function withTimeoutOrNull(promise, ms, label = "tarefa", deps = {}) {
    const logger = deps.logger ?? logger_1.log;
    try {
        return (await Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)),
        ]));
    }
    catch (e) {
        logger.warn(`[Orchestrator] ${label} falhou/timeout (${ms}ms): ${e?.message}`);
        return null;
    }
}
exports.defaultParallelFetchService = new ParallelFetchService();
//# sourceMappingURL=parallelFetch.js.map