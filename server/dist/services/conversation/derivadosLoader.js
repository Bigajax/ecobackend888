"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConversationContext = loadConversationContext;
// server/services/conversation/derivadosLoader.ts
const utils_1 = require("../../utils");
const CacheService_1 = require("../CacheService");
const derivadosService_1 = require("../derivadosService");
const parallelFetch_1 = require("./parallelFetch");
const logger_1 = require("../promptContext/logger");
const DEFAULT_DERIVADOS_TIMEOUT_MS = Number(process.env.ECO_DERIVADOS_TIMEOUT_MS ?? 600);
const DEFAULT_PARALELAS_TIMEOUT_MS = Number(process.env.ECO_PARALELAS_TIMEOUT_MS ?? 180);
const EMPTY_PARALLEL_RESULT = {
    heuristicas: [],
    userEmbedding: [],
    memsSemelhantes: [],
};
async function loadConversationContext(userId, ultimaMsg, supabase, options = {}) {
    const { promptOverride, metaFromBuilder, logger = logger_1.log, parallelFetchService = parallelFetch_1.defaultParallelFetchService, cache = CacheService_1.DERIVADOS_CACHE, getDerivadosFn = derivadosService_1.getDerivados, insightAberturaFn = derivadosService_1.insightAbertura, withTimeoutOrNullFn = parallelFetch_1.withTimeoutOrNull, sleepFn = utils_1.sleep, derivadosTimeoutMs = DEFAULT_DERIVADOS_TIMEOUT_MS, paralelasTimeoutMs = DEFAULT_PARALELAS_TIMEOUT_MS, } = options;
    const shouldSkipDerivados = !!promptOverride ||
        (metaFromBuilder && Number(metaFromBuilder?.nivel) === 1) ||
        !userId ||
        !supabase;
    const derivadosCacheKey = !shouldSkipDerivados && userId ? `derivados:${userId}` : null;
    const cachedDerivados = derivadosCacheKey
        ? cache.get(derivadosCacheKey) ?? null
        : null;
    const paralelasPromise = promptOverride
        ? Promise.resolve(EMPTY_PARALLEL_RESULT)
        : Promise.race([
            parallelFetchService.run({ ultimaMsg, userId, supabase }),
            sleepFn(paralelasTimeoutMs).then(() => EMPTY_PARALLEL_RESULT),
        ]);
    const derivadosPromise = shouldSkipDerivados || cachedDerivados
        ? Promise.resolve(cachedDerivados)
        : withTimeoutOrNullFn((async () => {
            try {
                const [{ data: stats }, { data: marcos }, { data: efeitos }] = await Promise.all([
                    supabase
                        .from("user_theme_stats")
                        .select("tema,freq_30d,int_media_30d")
                        .eq("user_id", userId)
                        .order("freq_30d", { ascending: false })
                        .limit(5),
                    supabase
                        .from("user_temporal_milestones")
                        .select("tema,resumo_evolucao,marco_at")
                        .eq("user_id", userId)
                        .order("marco_at", { ascending: false })
                        .limit(3),
                    supabase
                        .from("interaction_effects")
                        .select("efeito,score,created_at")
                        .eq("user_id", userId)
                        .order("created_at", { ascending: false })
                        .limit(30),
                ]);
                const arr = (efeitos || []).map((r) => ({
                    x: { efeito: r?.efeito ?? "neutro" },
                }));
                const scores = (efeitos || [])
                    .map((r) => Number(r?.score))
                    .filter((v) => Number.isFinite(v));
                const media = scores.length
                    ? scores.reduce((a, b) => a + b, 0) /
                        scores.length
                    : 0;
                return getDerivadosFn((stats || []), (marcos || []), arr, media);
            }
            catch (e) {
                logger?.warn?.(`[derivadosLoader] falha ao buscar derivados: ${e?.message}`);
                return null;
            }
        })(), derivadosTimeoutMs, "derivados", 
        // Cast para evitar conflitos de tipo caso withTimeoutOrNull espere LogAPI completo
        { logger: logger });
    const paralelas = await paralelasPromise;
    const derivados = await derivadosPromise;
    if (derivadosCacheKey &&
        !cachedDerivados &&
        derivados &&
        typeof derivados === "object") {
        cache.set(derivadosCacheKey, derivados);
    }
    const heuristicas = paralelas?.heuristicas ?? [];
    const userEmbedding = paralelas?.userEmbedding ?? [];
    const memsSemelhantes = paralelas?.memsSemelhantes ?? [];
    const aberturaHibrida = derivados
        ? (() => {
            try {
                return insightAberturaFn(derivados);
            }
            catch (e) {
                logger?.warn?.(`[derivadosLoader] insightAbertura falhou: ${e?.message}`);
                return null;
            }
        })()
        : null;
    return {
        heuristicas,
        userEmbedding,
        memsSemelhantes,
        derivados: (derivados ?? null),
        aberturaHibrida,
    };
}
//# sourceMappingURL=derivadosLoader.js.map