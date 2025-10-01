"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const text_1 = require("../../utils/text");
const Module = require("node:module");
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_ANON_KEY ??= "anon";
function setupOrchestratorTest({ microResponse, greetingResult, finalizerResult, }) {
    const originalLoad = Module._load;
    const finalizeCalls = [];
    const modulePath = require.resolve("../../services/ConversationOrchestrator");
    Module._load = function patched(request, parent, isMain) {
        if (request === "../adapters/SupabaseAdapter") {
            return { supabaseWithBearer: () => ({}) };
        }
        if (request === "../core/ResponseGenerator") {
            return { microReflexoLocal: () => microResponse };
        }
        if (request === "./conversation/greeting") {
            return {
                defaultGreetingPipeline: {
                    handle: () => ({ ...greetingResult }),
                },
            };
        }
        if (request === "./conversation/responseFinalizer") {
            return {
                defaultResponseFinalizer: {
                    finalize: async (params) => {
                        finalizeCalls.push(params);
                        return finalizerResult;
                    },
                },
            };
        }
        return originalLoad(request, parent, isMain);
    };
    try {
        delete require.cache[modulePath];
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const orchestrator = require(modulePath);
        Module._load = originalLoad;
        return {
            orchestrator,
            finalizeCalls,
            cleanup: () => {
                delete require.cache[modulePath];
                Module._load = originalLoad;
            },
        };
    }
    catch (error) {
        Module._load = originalLoad;
        throw error;
    }
}
(0, node_test_1.default)("micro reflex streaming inclui bloco JSON finalizado", async (t) => {
    const finalizerResult = {
        message: "Resposta ajustada",
        intensidade: 0.7,
        resumo: "Resumo breve",
        emocao: "alegria",
        tags: ["apoio"],
        categoria: "apoio",
        proactive: null,
    };
    const { orchestrator, finalizeCalls, cleanup } = setupOrchestratorTest({
        microResponse: "resposta micro",
        greetingResult: { handled: false },
        finalizerResult,
    });
    t.after(cleanup);
    const events = [];
    const streaming = (await orchestrator.getEcoResponse({
        messages: [{ role: "user", content: "estou cansado" }],
        userId: "user-1",
        userName: "Ana",
        accessToken: "token",
        stream: {
            onEvent: async (event) => {
                events.push(event);
            },
        },
    }));
    const chunkEvents = events.filter((e) => e.type === "chunk");
    strict_1.default.strictEqual(chunkEvents.length, 1, "deve emitir exatamente um chunk");
    const finalText = chunkEvents[0].content;
    strict_1.default.ok(finalText.includes("```json"), "chunk final deve conter bloco JSON");
    const payload = (0, text_1.extractJson)(finalText);
    strict_1.default.ok(payload, "JSON do chunk deve ser parseável");
    strict_1.default.strictEqual(payload?.intensidade, finalizerResult.intensidade);
    strict_1.default.strictEqual(payload?.resumo, finalizerResult.resumo);
    strict_1.default.deepStrictEqual(payload?.tags, finalizerResult.tags);
    strict_1.default.strictEqual(payload?.categoria, finalizerResult.categoria);
    strict_1.default.strictEqual(streaming.raw, finalText, "raw deve espelhar o texto final emitido");
    const resolved = await streaming.finalize();
    strict_1.default.deepStrictEqual(resolved, finalizerResult);
    strict_1.default.strictEqual(finalizeCalls.length, 1, "finalizer deve ser chamado uma vez");
    strict_1.default.strictEqual(finalizeCalls[0].modelo, "micro-reflexo");
    strict_1.default.strictEqual(finalizeCalls[0].mode, "fast");
    strict_1.default.strictEqual(finalizeCalls[0].hasAssistantBefore, false);
});
(0, node_test_1.default)("greeting streaming inclui bloco JSON finalizado", async (t) => {
    const finalizerResult = {
        message: "Oi, bora começar?",
        emocao: "neutra",
        tags: [],
        categoria: null,
        proactive: null,
    };
    const { orchestrator, finalizeCalls, cleanup } = setupOrchestratorTest({
        microResponse: null,
        greetingResult: { handled: true, response: "Olá!" },
        finalizerResult,
    });
    t.after(cleanup);
    const events = [];
    const streaming = (await orchestrator.getEcoResponse({
        messages: [{ role: "user", content: "oi" }],
        userId: "user-2",
        userName: "Bruno",
        accessToken: "token",
        stream: {
            onEvent: async (event) => {
                events.push(event);
            },
        },
    }));
    const chunkEvents = events.filter((e) => e.type === "chunk");
    strict_1.default.strictEqual(chunkEvents.length, 1, "saudação deve emitir único chunk");
    const finalText = chunkEvents[0].content;
    strict_1.default.ok(finalText.includes("```json"));
    const payload = (0, text_1.extractJson)(finalText);
    strict_1.default.ok(payload);
    strict_1.default.strictEqual(payload?.emocao, finalizerResult.emocao);
    strict_1.default.deepStrictEqual(payload?.tags, finalizerResult.tags);
    strict_1.default.strictEqual(streaming.raw, finalText);
    const resolved = await streaming.finalize();
    strict_1.default.deepStrictEqual(resolved, finalizerResult);
    strict_1.default.strictEqual(finalizeCalls.length, 1);
    strict_1.default.strictEqual(finalizeCalls[0].modelo, "greeting");
    strict_1.default.strictEqual(finalizeCalls[0].mode, "fast");
    strict_1.default.strictEqual(finalizeCalls[0].hasAssistantBefore, false);
});
//# sourceMappingURL=orchestratorFastPaths.test.js.map