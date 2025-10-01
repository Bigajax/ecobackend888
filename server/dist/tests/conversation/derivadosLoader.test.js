"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const derivadosLoader_1 = require("../../services/conversation/derivadosLoader");
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";
const parallelResult = {
    heuristicas: ["h1"],
    userEmbedding: [0.1, 0.2],
    memsSemelhantes: ["mem"],
};
(0, node_test_1.default)("usa derivados do cache quando disponíveis", async () => {
    const cached = {
        top_temas_30d: [],
        marcos: [],
        heuristica_interacao: {
            efeitos_ultimas_10: { abriu: 1, fechou: 0, neutro: 0 },
            media_score: 0.2,
            dica_estilo: "ok",
        },
    };
    let fromCalled = false;
    const supabase = {
        from() {
            fromCalled = true;
            throw new Error("should not query supabase when cached");
        },
    };
    const cache = {
        get: () => cached,
        set: () => {
            throw new Error("should not update cache when already cached");
        },
    };
    const result = await (0, derivadosLoader_1.loadConversationContext)("user-1", "olá", supabase, {
        cache,
        parallelFetchService: {
            run: async () => parallelResult,
        },
    });
    node_assert_1.default.strictEqual(fromCalled, false);
    node_assert_1.default.deepStrictEqual(result.derivados, cached);
    node_assert_1.default.deepStrictEqual(result.heuristicas, parallelResult.heuristicas);
    node_assert_1.default.deepStrictEqual(result.userEmbedding, parallelResult.userEmbedding);
    node_assert_1.default.deepStrictEqual(result.memsSemelhantes, parallelResult.memsSemelhantes);
});
(0, node_test_1.default)("retorna null para derivados quando timeout ocorre", async () => {
    const calls = [];
    const supabase = {
        from(table) {
            calls.push(table);
            return {
                select() {
                    return this;
                },
                eq() {
                    return this;
                },
                order() {
                    return this;
                },
                limit() {
                    return Promise.resolve({ data: [] });
                },
            };
        },
    };
    let cacheSet = false;
    const cache = new Map();
    const result = await (0, derivadosLoader_1.loadConversationContext)("user-2", "oi", supabase, {
        cache: {
            get: (key) => cache.get(key) ?? undefined,
            set: (key, value) => {
                cacheSet = true;
                cache.set(key, value);
            },
        },
        parallelFetchService: {
            run: async () => ({ heuristicas: [], userEmbedding: [], memsSemelhantes: [] }),
        },
        withTimeoutOrNullFn: async () => null,
    });
    node_assert_1.default.deepStrictEqual(calls, [
        "user_theme_stats",
        "user_temporal_milestones",
        "interaction_effects",
    ]);
    node_assert_1.default.strictEqual(result.derivados, null);
    node_assert_1.default.strictEqual(result.aberturaHibrida, null);
    node_assert_1.default.strictEqual(cacheSet, false);
});
(0, node_test_1.default)("transforma efeitos em estrutura compatível com insight de abertura", async () => {
    const dataByTable = {
        user_theme_stats: [
            { tema: "sono", freq_30d: 3, int_media_30d: 0.1 },
        ],
        user_temporal_milestones: [
            { tema: "rotina", resumo_evolucao: "consegui manter", marco_at: "2024-01-01" },
        ],
        interaction_effects: [
            { efeito: "abriu", score: 0.3, created_at: "2024-01-02" },
            { efeito: "neutro", score: -0.1, created_at: "2024-01-03" },
        ],
    };
    function createBuilder(table) {
        const self = {
            select() {
                return self;
            },
            eq() {
                return self;
            },
            order() {
                return self;
            },
            limit() {
                return Promise.resolve({ data: dataByTable[table] || [] });
            },
        };
        return self;
    }
    const supabase = {
        from(table) {
            return createBuilder(table);
        },
    };
    const result = await (0, derivadosLoader_1.loadConversationContext)("user-3", "quero refletir", supabase, {
        parallelFetchService: {
            run: async () => ({
                heuristicas: ["hx"],
                userEmbedding: [1, 2],
                memsSemelhantes: ["memx"],
            }),
        },
    });
    node_assert_1.default.ok(result.derivados);
    node_assert_1.default.deepStrictEqual(result.derivados?.heuristica_interacao.efeitos_ultimas_10, {
        abriu: 1,
        fechou: 0,
        neutro: 1,
    });
    node_assert_1.default.strictEqual(result.derivados?.heuristica_interacao.media_score, 0.1);
    node_assert_1.default.strictEqual(result.aberturaHibrida, "consegui manter");
    node_assert_1.default.deepStrictEqual(result.heuristicas, ["hx"]);
    node_assert_1.default.deepStrictEqual(result.userEmbedding, [1, 2]);
    node_assert_1.default.deepStrictEqual(result.memsSemelhantes, ["memx"]);
});
//# sourceMappingURL=derivadosLoader.test.js.map