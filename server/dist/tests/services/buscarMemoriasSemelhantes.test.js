"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const ensureSupabaseEnv = () => {
    process.env.SUPABASE_URL ??= "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";
};
const tests = [];
function test(name, run) {
    tests.push({ name, run });
}
test("buscarMemoriasSemelhantes normalizes provided embeddings", async () => {
    ensureSupabaseEnv();
    const { buscarMemoriasSemelhantes } = await Promise.resolve().then(() => __importStar(require("../../services/buscarMemorias")));
    const calls = [];
    const fakeClient = {
        rpc: async (fn, params) => {
            calls.push({ fn, params });
            return {
                data: [
                    {
                        id: "mem-1",
                        resumo_eco: "Resumo",
                        similarity: 0.92,
                    },
                ],
                error: null,
            };
        },
    };
    const resultado = await buscarMemoriasSemelhantes("user-1", {
        userEmbedding: [3, 4],
        k: 1,
        threshold: 0.5,
        supabaseClient: fakeClient,
    });
    strict_1.default.equal(calls.length, 1, "deveria chamar a RPC apenas uma vez");
    const embedding = calls[0].params.query_embedding;
    strict_1.default.ok(Math.abs(Math.hypot(...embedding) - 1) < 1e-9, "embedding deve ter norma 1");
    strict_1.default.ok(Math.abs(embedding[0] - 0.6) < 1e-12);
    strict_1.default.ok(Math.abs(embedding[1] - 0.8) < 1e-12);
    strict_1.default.equal(resultado.length, 1);
    strict_1.default.equal(resultado[0]?.id, "mem-1");
});
(async () => {
    let failures = 0;
    for (const { name, run } of tests) {
        try {
            await run();
            console.log(`✓ ${name}`);
        }
        catch (error) {
            failures += 1;
            console.error(`✗ ${name}`);
            console.error(error);
        }
    }
    if (failures > 0) {
        console.error(`${failures} test(s) failed.`);
        process.exitCode = 1;
    }
    else {
        console.log(`All ${tests.length} test(s) passed.`);
    }
})();
//# sourceMappingURL=buscarMemoriasSemelhantes.test.js.map