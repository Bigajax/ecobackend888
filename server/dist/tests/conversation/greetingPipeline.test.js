"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const greeting_1 = require("../../services/conversation/greeting");
const respostaSaudacaoAutomatica_1 = require("../../utils/respostaSaudacaoAutomatica");
function createPipeline() {
    const marks = [];
    const guard = {
        can: () => true,
        mark: (userId) => {
            marks.push(userId);
        },
    };
    return { pipeline: new greeting_1.GreetingPipeline(guard), marks };
}
(0, node_test_1.default)("dispara saudação automática para cumprimentos conhecidos", () => {
    const greetings = ["hello", "hey Eco", "fala aí"];
    for (const message of greetings) {
        const auto = (0, respostaSaudacaoAutomatica_1.respostaSaudacaoAutomatica)({
            messages: [{ role: "user", content: message }],
        });
        node_assert_1.default.ok(auto, `respostaSaudacaoAutomatica deveria retornar meta para "${message}"`);
        node_assert_1.default.strictEqual(auto.meta.isGreeting, true, `meta.isGreeting deveria ser true para "${message}"`);
        const { pipeline, marks } = createPipeline();
        const result = pipeline.handle({
            messages: [{ role: "user", content: message }],
            ultimaMsg: message,
            greetingEnabled: true,
            userId: "user-123",
        });
        node_assert_1.default.strictEqual(result.handled, true, `pipeline deve tratar "${message}"`);
        node_assert_1.default.ok(result.response && result.response.length > 0, "deve haver resposta automática");
        node_assert_1.default.deepStrictEqual(marks, ["user-123"], "guard.mark deve ser acionado");
    }
});
(0, node_test_1.default)("não envia saudação quando há conteúdo substantivo", () => {
    const { pipeline, marks } = createPipeline();
    const message = "fala aí, preciso de ajuda com um projeto?";
    const result = pipeline.handle({
        messages: [{ role: "user", content: message }],
        ultimaMsg: message,
        greetingEnabled: true,
        userId: "user-456",
    });
    node_assert_1.default.deepStrictEqual(result, { handled: false });
    node_assert_1.default.deepStrictEqual(marks, []);
});
(0, node_test_1.default)("não repete saudação automática quando assistente já respondeu", () => {
    const { pipeline, marks } = createPipeline();
    const history = [
        { role: "assistant", content: "Olá! Como posso ajudar hoje?" },
        { role: "user", content: "Oi" },
    ];
    const result = pipeline.handle({
        messages: history,
        ultimaMsg: "Oi",
        greetingEnabled: true,
        userId: "user-789",
    });
    node_assert_1.default.deepStrictEqual(result, { handled: false });
    node_assert_1.default.deepStrictEqual(marks, []);
});
//# sourceMappingURL=greetingPipeline.test.js.map