"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const fastLane_1 = require("../../services/conversation/fastLane");
function createDeps(overrides = {}) {
    const claudeCalls = [];
    const finalizeCalls = [];
    const claudeClient = overrides.claudeClient
        ? overrides.claudeClient
        : async (params) => {
            claudeCalls.push(params);
            return { content: "ok", usage: { total_tokens: 42 }, model: "test-model" };
        };
    const responseFinalizer = overrides.responseFinalizer
        ? overrides.responseFinalizer
        : {
            finalize: async (params) => {
                finalizeCalls.push(params);
                return { message: `final:${params.raw}` };
            },
        };
    const firstName = overrides.firstName
        ? overrides.firstName
        : (value) => value?.split(" ")[0] ?? "";
    return {
        claudeCalls,
        finalizeCalls,
        deps: {
            claudeClient,
            responseFinalizer,
            firstName,
        },
    };
}
(0, node_test_1.default)("detectExplicitAskForSteps reconhece pedidos explícitos", () => {
    node_assert_1.default.ok((0, fastLane_1.detectExplicitAskForSteps)("pode me mostrar os passos?"));
    node_assert_1.default.ok((0, fastLane_1.detectExplicitAskForSteps)("como faço pra lidar com isso"));
    node_assert_1.default.ok((0, fastLane_1.detectExplicitAskForSteps)("preciso de um guia ou checklist"));
    node_assert_1.default.strictEqual((0, fastLane_1.detectExplicitAskForSteps)("quero refletir sobre um sentimento"), false);
});
(0, node_test_1.default)("runFastLaneLLM envia apenas as 3 últimas mensagens do histórico", async () => {
    const history = [
        { role: "user", content: "mensagem 1" },
        { role: "assistant", content: "mensagem 2" },
        { role: "user", content: "mensagem 3" },
        { role: "assistant", content: "mensagem 4" },
        { role: "user", content: "mensagem 5" },
    ];
    const { deps, claudeCalls, finalizeCalls } = createDeps();
    const result = (await (0, fastLane_1.runFastLaneLLM)({
        messages: history,
        userName: "Ana Maria",
        ultimaMsg: "mensagem 5",
        hasAssistantBefore: true,
        userId: "user-123",
        supabase: { tag: "db" },
        lastMessageId: "msg-5",
        startedAt: 1000,
        deps,
        sessionMeta: { distinctId: "distinct-xyz" },
    }));
    node_assert_1.default.strictEqual(claudeCalls.length, 1);
    const sentMessages = claudeCalls[0].messages;
    node_assert_1.default.strictEqual(sentMessages.length, 4); // system + 3 últimas mensagens
    node_assert_1.default.deepStrictEqual(sentMessages.slice(1).map((m) => m.content), ["mensagem 3", "mensagem 4", "mensagem 5"]);
    node_assert_1.default.strictEqual(result.raw, "ok");
    node_assert_1.default.deepStrictEqual(result.usage, { total_tokens: 42 });
    node_assert_1.default.strictEqual(result.model, "test-model");
    node_assert_1.default.deepStrictEqual(result.response, { message: "final:ok" });
    node_assert_1.default.strictEqual(finalizeCalls.length, 1);
    node_assert_1.default.strictEqual(finalizeCalls[0].raw, "ok");
    node_assert_1.default.strictEqual(finalizeCalls[0].usageTokens, 42);
    node_assert_1.default.strictEqual(finalizeCalls[0].modelo, "test-model");
    node_assert_1.default.strictEqual(finalizeCalls[0].mode, "fast");
    node_assert_1.default.strictEqual(finalizeCalls[0].sessionMeta?.distinctId, "distinct-xyz", "finalize recebe sessionMeta");
});
(0, node_test_1.default)("runFastLaneLLM usa fallback quando o cliente Claude falha", async () => {
    const fallbackError = new Error("claude indisponível");
    const fallbackCalls = [];
    const { deps } = createDeps({
        claudeClient: async () => {
            throw fallbackError;
        },
        responseFinalizer: {
            finalize: async (params) => {
                fallbackCalls.push(params);
                return { message: params.raw };
            },
        },
    });
    const result = await (0, fastLane_1.runFastLaneLLM)({
        messages: [{ role: "user", content: "oi" }],
        userName: "João",
        ultimaMsg: "oi",
        hasAssistantBefore: false,
        userId: "user-999",
        supabase: null,
        lastMessageId: undefined,
        startedAt: 123,
        deps,
        sessionMeta: { distinctId: "fallback-1" },
    });
    node_assert_1.default.strictEqual(result.raw, "Tô aqui com você. Quer me contar um pouco mais?");
    node_assert_1.default.strictEqual(result.model, "fastlane-fallback");
    node_assert_1.default.strictEqual(result.usage, null);
    node_assert_1.default.deepStrictEqual(result.response, {
        message: "Tô aqui com você. Quer me contar um pouco mais?",
    });
    node_assert_1.default.strictEqual(fallbackCalls.length, 1);
    node_assert_1.default.strictEqual(fallbackCalls[0].modelo, "fastlane-fallback", "finalizer recebe modelo de fallback");
});
(0, node_test_1.default)("STYLE_SELECTOR alterna entre coach e espelho conforme o pedido", async () => {
    const recordedSystems = [];
    const claudeClient = async (params) => {
        recordedSystems.push(params.messages[0].content);
        return { content: "ok", usage: null, model: "style-test" };
    };
    const { deps } = createDeps({ claudeClient });
    await (0, fastLane_1.runFastLaneLLM)({
        messages: [{ role: "user", content: "pode me dar passos?" }],
        userName: "Carlos Silva",
        ultimaMsg: "pode me dar passos?",
        hasAssistantBefore: false,
        userId: undefined,
        supabase: undefined,
        lastMessageId: undefined,
        startedAt: 0,
        deps,
    });
    await (0, fastLane_1.runFastLaneLLM)({
        messages: [{ role: "user", content: "quero apenas refletir" }],
        userName: "Carlos Silva",
        ultimaMsg: "quero apenas refletir",
        hasAssistantBefore: false,
        userId: undefined,
        supabase: undefined,
        lastMessageId: undefined,
        startedAt: 0,
        deps,
    });
    node_assert_1.default.strictEqual(recordedSystems.length, 2);
    node_assert_1.default.ok(recordedSystems[0].includes("Preferir plano COACH"));
    node_assert_1.default.ok(recordedSystems[1].includes("Preferir plano ESPELHO"));
});
//# sourceMappingURL=fastLane.test.js.map