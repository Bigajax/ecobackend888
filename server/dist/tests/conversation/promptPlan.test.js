"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const promptPlan_1 = require("../../services/conversation/promptPlan");
function createDecision(overrides = {}) {
    return {
        mode: "full",
        hasAssistantBefore: false,
        vivaAtivo: false,
        lowComplexity: false,
        nivelRoteador: 2,
        forceFull: false,
        ...overrides,
    };
}
(0, node_test_1.default)("maxTokens respects length thresholds", () => {
    const baseParams = {
        decision: createDecision(),
        systemPrompt: "Contexto acumulado",
        messages: [],
    };
    const short = (0, promptPlan_1.buildFullPrompt)({
        ...baseParams,
        ultimaMsg: "Oi Eco",
    });
    node_assert_1.default.strictEqual(short.maxTokens, 420);
    const medium = (0, promptPlan_1.buildFullPrompt)({
        ...baseParams,
        ultimaMsg: "x".repeat(200),
    });
    node_assert_1.default.strictEqual(medium.maxTokens, 560);
    const long = (0, promptPlan_1.buildFullPrompt)({
        ...baseParams,
        ultimaMsg: "x".repeat(400),
    });
    node_assert_1.default.strictEqual(long.maxTokens, 700);
});
(0, node_test_1.default)("seleciona estilo coach quando usuário pede passos e viva está desligado", () => {
    const { prompt } = (0, promptPlan_1.buildFullPrompt)({
        decision: createDecision(),
        ultimaMsg: "Pode me dar passos concretos?",
        systemPrompt: "Contexto cacheado",
        messages: [
            { role: "user", content: "Mensagem antiga" },
            { role: "assistant", content: "Resposta antiga" },
        ],
        historyLimit: 1,
    });
    node_assert_1.default.ok(prompt[0].content.startsWith("Preferir plano COACH"));
    node_assert_1.default.strictEqual(prompt.length, 1 + 1);
    node_assert_1.default.strictEqual(prompt[1].content, "Resposta antiga");
});
(0, node_test_1.default)("mantém estilo espelho quando viva está ativo", () => {
    const { prompt } = (0, promptPlan_1.buildFullPrompt)({
        decision: createDecision({ vivaAtivo: true }),
        ultimaMsg: "Pode me dar passos concretos?",
        systemPrompt: "Contexto cacheado",
        messages: [],
    });
    node_assert_1.default.ok(prompt[0].content.startsWith("Preferir plano ESPELHO"));
});
(0, node_test_1.default)("system prompt combina seletor de estilo e contexto", () => {
    const contexto = "Contexto da cache";
    const { prompt } = (0, promptPlan_1.buildFullPrompt)({
        decision: createDecision({ nivelRoteador: 1 }),
        ultimaMsg: "Tudo bem?",
        systemPrompt: contexto,
        messages: [],
    });
    node_assert_1.default.strictEqual(prompt[0].content, `Preferir plano COACH (30%): acolher (1 linha) • encorajar com leveza • (opcional) até 3 passos curtos • fechar com incentivo.\n${contexto}`);
});
//# sourceMappingURL=promptPlan.test.js.map