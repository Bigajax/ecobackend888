"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ContextBuilder_1 = __importDefault(require("../../services/promptContext/ContextBuilder"));
const ModuleStore_1 = require("../../services/promptContext/ModuleStore");
const inlineModules = {
    "NV1_CORE.txt": "Conteúdo NV1 core",
    "IDENTIDADE_MINI.txt": "Conteúdo identidade mini",
    "ANTISALDO_MIN.txt": "Conteúdo antissaldo mínimo",
    "ESCALA_ABERTURA_1a3.txt": "Conteúdo escala de abertura",
};
ModuleStore_1.ModuleStore.configure([]);
for (const [name, content] of Object.entries(inlineModules)) {
    ModuleStore_1.ModuleStore.registerInline(name, content);
}
const params = {
    userName: "Maria Clara Silva",
    texto: "Oi, tudo bem?",
    mems: [],
};
(0, node_test_1.test)("ContextBuilder inclui lembrete com o nome do usuário", async () => {
    const resultado = await (0, ContextBuilder_1.default)(params);
    const prompt = resultado.montarMensagemAtual(params.texto);
    strict_1.default.match(prompt, /Usuário se chama Maria; use o nome apenas quando fizer sentido\./);
});
//# sourceMappingURL=ContextBuilder.test.js.map