"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";
const { ParallelFetchService } = require("../../services/conversation/parallelFetch");
const fakeEmbedding = [0.1, 0.2, 0.3];
function createDeps(overrides = {}) {
    const calls = {
        getEmbedding: [],
        getHeuristicas: [],
        getMemorias: [],
    };
    const warnings = [];
    const deps = {
        getEmbedding: async (texto, tipo) => {
            calls.getEmbedding.push([texto, tipo]);
            if (overrides.getEmbedding) {
                return overrides.getEmbedding(texto, tipo);
            }
            return fakeEmbedding;
        },
        getHeuristicas: async (params) => {
            calls.getHeuristicas.push(params);
            if (overrides.getHeuristicas) {
                return overrides.getHeuristicas(params);
            }
            return ["heuristica"];
        },
        getMemorias: async (userId, params) => {
            calls.getMemorias.push([userId, params]);
            if (overrides.getMemorias) {
                return overrides.getMemorias(userId, params);
            }
            return ["mem"];
        },
        logger: {
            warn: (msg) => {
                warnings.push(msg);
                overrides.logger?.warn?.(msg);
            },
        },
        debug: overrides.debug ?? (() => true),
    };
    const service = new ParallelFetchService(deps);
    return { service, calls, warnings };
}
(0, node_test_1.default)("gera embedding apenas quando há mensagem relevante", async () => {
    const { service, calls } = createDeps();
    const res = await service.run({ ultimaMsg: "   ", userId: "user" });
    node_assert_1.default.deepStrictEqual(res, {
        heuristicas: [],
        memsSemelhantes: [],
        userEmbedding: [],
    });
    node_assert_1.default.strictEqual(calls.getEmbedding.length, 0);
    node_assert_1.default.strictEqual(calls.getHeuristicas.length, 0);
    node_assert_1.default.strictEqual(calls.getMemorias.length, 0);
});
(0, node_test_1.default)("encaminha embedding para heurísticas e memórias quando disponível", async () => {
    const { service, calls } = createDeps();
    const res = await service.run({
        ultimaMsg: "quero entender meus padrões",
        userId: "user-123",
        supabase: { tag: "db" },
    });
    node_assert_1.default.deepStrictEqual(res.heuristicas, ["heuristica"]);
    node_assert_1.default.deepStrictEqual(res.memsSemelhantes, ["mem"]);
    node_assert_1.default.deepStrictEqual(res.userEmbedding, fakeEmbedding);
    node_assert_1.default.deepStrictEqual(calls.getEmbedding[0], ["quero entender meus padrões", "entrada_usuario"]);
    node_assert_1.default.deepStrictEqual(calls.getHeuristicas[0], {
        usuarioId: "user-123",
        userEmbedding: fakeEmbedding,
        matchCount: 4,
    });
    node_assert_1.default.deepStrictEqual(calls.getMemorias[0], ["user-123", {
            texto: "quero entender meus padrões",
            k: 3,
            threshold: 0.12,
            supabaseClient: { tag: "db" },
        }]);
});
(0, node_test_1.default)("ignora busca de memórias quando usuário indefinido", async () => {
    const { service, calls } = createDeps();
    const res = await service.run({ ultimaMsg: "texto", userId: undefined });
    node_assert_1.default.deepStrictEqual(res.memsSemelhantes, []);
    node_assert_1.default.strictEqual(calls.getMemorias.length, 0);
});
(0, node_test_1.default)("continua execução com embedding vazio quando getEmbedding falha", async () => {
    const { service, calls, warnings } = createDeps({
        getEmbedding: async () => {
            throw new Error("embedding indisponível");
        },
    });
    const res = await service.run({ ultimaMsg: "preciso de ajuda", userId: "user" });
    node_assert_1.default.deepStrictEqual(res, {
        heuristicas: [],
        memsSemelhantes: [],
        userEmbedding: [],
    });
    node_assert_1.default.strictEqual(calls.getHeuristicas.length, 0);
    node_assert_1.default.strictEqual(calls.getMemorias.length, 0);
    node_assert_1.default.strictEqual(warnings.length, 1);
    node_assert_1.default.match(warnings[0], /getEmbedding falhou: embedding indisponível/);
});
//# sourceMappingURL=parallelFetch.test.js.map