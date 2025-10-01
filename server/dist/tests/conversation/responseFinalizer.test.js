"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-key";
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "dotenv") {
        return { config: () => ({ parsed: {} }) };
    }
    if (request === "mixpanel") {
        return {
            init: () => ({
                track: () => { },
                register: () => { },
                register_once: () => { },
                people: { set: () => { }, set_once: () => { }, increment: () => { } },
            }),
        };
    }
    return originalLoad(request, parent, isMain);
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const responseFinalizerModule = require("../../services/conversation/responseFinalizer");
const helpersModule = require("../../services/conversation/helpers");
const { ResponseFinalizer } = responseFinalizerModule;
const { stripRedundantGreeting, stripIdentityCorrection } = helpersModule;
Module._load = originalLoad;
const noop = () => { };
(0, node_test_1.default)("finalize responde rápido mesmo com analisador lento", async (t) => {
    const originalTimeout = process.env.ECO_BLOCO_TIMEOUT_MS;
    process.env.ECO_BLOCO_TIMEOUT_MS = "50";
    t.after(() => {
        if (originalTimeout === undefined) {
            delete process.env.ECO_BLOCO_TIMEOUT_MS;
        }
        else {
            process.env.ECO_BLOCO_TIMEOUT_MS = originalTimeout;
        }
    });
    let saveCalls = 0;
    const trackMensagemCalls = [];
    const identifyCalls = [];
    const sessaoEntrouCalls = [];
    const trackBlocoCalls = [];
    const finalizer = new ResponseFinalizer({
        gerarBlocoTecnicoComCache: () => new Promise((resolve) => {
            setTimeout(() => resolve({ intensidade: 0.8 }), 200);
        }),
        saveMemoryOrReference: async () => {
            saveCalls += 1;
        },
        trackMensagemEnviada: ((props) => {
            trackMensagemCalls.push(props);
        }),
        trackEcoDemorou: noop,
        trackBlocoTecnico: ((payload) => {
            trackBlocoCalls.push(payload);
        }),
        identifyUsuario: ((payload) => {
            identifyCalls.push(payload);
        }),
        trackSessaoEntrouChat: ((payload) => {
            sessaoEntrouCalls.push(payload);
        }),
    });
    const start = Date.now();
    const result = await finalizer.finalize({
        raw: "Oi",
        ultimaMsg: "Oi",
        hasAssistantBefore: false,
        mode: "fast",
        startedAt: Date.now(),
        userId: "user-123",
        sessionMeta: {
            distinctId: "distinct-123",
            versaoApp: "1.0.0",
            device: "ios",
            ambiente: "produção",
            sessaoId: "sessao-abc",
            origem: "app-mobile",
        },
    });
    const duration = Date.now() - start;
    strict_1.default.ok(duration < 150, `finalize deveria resolver rápido; levou ${duration}ms`);
    strict_1.default.strictEqual(result.intensidade, undefined);
    await new Promise((resolve) => setTimeout(resolve, 250));
    strict_1.default.ok(saveCalls >= 1, "saveMemoryOrReference deve ser disparado em background");
    strict_1.default.strictEqual(trackMensagemCalls.length, 1, "trackMensagemEnviada deve ser chamado");
    strict_1.default.strictEqual(trackMensagemCalls[0].distinctId, "distinct-123", "trackMensagemEnviada deve receber distinctId");
    strict_1.default.strictEqual(trackMensagemCalls[0].blocoStatus, "pending", "trackMensagemEnviada deve registrar bloco pendente no modo fast");
    strict_1.default.ok(trackBlocoCalls.some((c) => c.status === "pending"), "trackBlocoTecnico deve registrar status pendente");
    strict_1.default.ok(trackBlocoCalls.some((c) => c.status === "timeout"), "trackBlocoTecnico deve registrar timeout quando houver");
    strict_1.default.ok(trackBlocoCalls.some((c) => c.status === "success"), "trackBlocoTecnico deve registrar sucesso quando bloco concluir em background");
    strict_1.default.strictEqual(sessaoEntrouCalls.length, 1, "trackSessaoEntrouChat deve ser chamado na primeira interação");
    strict_1.default.deepStrictEqual(sessaoEntrouCalls[0], {
        distinctId: "distinct-123",
        userId: "user-123",
        mode: "fast",
        sessaoId: "sessao-abc",
        origem: "app-mobile",
        versaoApp: "1.0.0",
        device: "ios",
        ambiente: "produção",
    });
    strict_1.default.strictEqual(identifyCalls.length, 1, "identifyUsuario deve ser chamado no primeiro contato");
    strict_1.default.deepStrictEqual(identifyCalls[0], {
        distinctId: "distinct-123",
        userId: "user-123",
        versaoApp: "1.0.0",
        device: "ios",
        ambiente: "produção",
    });
});
(0, node_test_1.default)("trackSessaoEntrouChat só dispara quando não houve assistente antes", async () => {
    const sessaoEntrouCalls = [];
    const finalizer = new ResponseFinalizer({
        gerarBlocoTecnicoComCache: async () => null,
        saveMemoryOrReference: async () => { },
        trackMensagemEnviada: noop,
        trackEcoDemorou: noop,
        trackBlocoTecnico: noop,
        identifyUsuario: noop,
        trackSessaoEntrouChat: ((payload) => {
            sessaoEntrouCalls.push(payload);
        }),
    });
    await finalizer.finalize({
        raw: "Olá",
        ultimaMsg: "Olá",
        hasAssistantBefore: false,
        mode: "full",
        startedAt: Date.now(),
        sessionMeta: { distinctId: "d-1" },
    });
    await finalizer.finalize({
        raw: "Oi de novo",
        ultimaMsg: "Oi de novo",
        hasAssistantBefore: true,
        mode: "fast",
        startedAt: Date.now(),
        sessionMeta: { distinctId: "d-1" },
    });
    strict_1.default.strictEqual(sessaoEntrouCalls.length, 1);
    strict_1.default.strictEqual(sessaoEntrouCalls[0].mode, "full");
});
(0, node_test_1.default)("identifyUsuario é chamado mesmo quando já houve assistente se houver sessionMeta", async () => {
    const identifyCalls = [];
    const finalizer = new ResponseFinalizer({
        gerarBlocoTecnicoComCache: async () => null,
        saveMemoryOrReference: async () => { },
        trackMensagemEnviada: noop,
        trackEcoDemorou: noop,
        trackBlocoTecnico: noop,
        identifyUsuario: ((payload) => {
            identifyCalls.push(payload);
        }),
        trackSessaoEntrouChat: noop,
    });
    await finalizer.finalize({
        raw: "Olá novamente",
        ultimaMsg: "Olá novamente",
        hasAssistantBefore: true,
        mode: "fast",
        startedAt: Date.now(),
        sessionMeta: {
            distinctId: "distinct-xyz",
            versaoApp: "2.0.0",
            device: "android",
            ambiente: "staging",
        },
    });
    strict_1.default.strictEqual(identifyCalls.length, 1);
    strict_1.default.deepStrictEqual(identifyCalls[0], {
        distinctId: "distinct-xyz",
        userId: undefined,
        versaoApp: "2.0.0",
        device: "android",
        ambiente: "staging",
    });
});
(0, node_test_1.default)("preenche intensidade e resumo quando bloco chega dentro do timeout", async (t) => {
    const originalTimeout = process.env.ECO_BLOCO_TIMEOUT_MS;
    process.env.ECO_BLOCO_TIMEOUT_MS = "1000";
    t.after(() => {
        if (originalTimeout === undefined) {
            delete process.env.ECO_BLOCO_TIMEOUT_MS;
        }
        else {
            process.env.ECO_BLOCO_TIMEOUT_MS = originalTimeout;
        }
    });
    const finalizer = new ResponseFinalizer({
        gerarBlocoTecnicoComCache: async () => ({
            intensidade: 0.42,
            analise_resumo: "  resumo alinhado  ",
            emocao_principal: "alegria",
            tags: ["tag-a"],
        }),
        saveMemoryOrReference: async () => { },
        trackMensagemEnviada: noop,
        trackEcoDemorou: noop,
        trackBlocoTecnico: noop,
        identifyUsuario: noop,
        trackSessaoEntrouChat: noop,
    });
    const result = await finalizer.finalize({
        raw: "Olá!",
        ultimaMsg: "Olá!",
        hasAssistantBefore: false,
        mode: "full",
        startedAt: Date.now(),
    });
    strict_1.default.strictEqual(result.intensidade, 0.42);
    strict_1.default.strictEqual(result.resumo, "resumo alinhado");
});
(0, node_test_1.default)("stripRedundantGreeting remove saudação quando assistente já respondeu", () => {
    const casos = [
        ["Oi, tudo bem?", "tudo bem?"],
        ["Boa noite! Como posso ajudar?", "Como posso ajudar?"],
    ];
    for (const [input, esperado] of casos) {
        const resultado = stripRedundantGreeting(input, true);
        strict_1.default.strictEqual(resultado, esperado);
    }
    const semAssistente = stripRedundantGreeting("Oi, tudo bem?", false);
    strict_1.default.strictEqual(semAssistente, "Oi, tudo bem?");
});
(0, node_test_1.default)("stripIdentityCorrection lida com nomes contendo metacaracteres de regex", () => {
    const casos = [
        ["Oi!\nEu sou a Eco, não a C++.", "C++", "Oi!"],
        ["Bem-vinda!\nEu sou a Eco, não a Ana(.", "Ana(", "Bem-vinda!"],
    ];
    for (const [input, nome, esperado] of casos) {
        const resultado = stripIdentityCorrection(input, nome);
        strict_1.default.strictEqual(resultado, esperado);
    }
});
(0, node_test_1.default)("finalize remove correção de identidade com nome que contém parênteses", async () => {
    const finalizer = new ResponseFinalizer({
        gerarBlocoTecnicoComCache: async () => null,
        saveMemoryOrReference: async () => { },
        trackMensagemEnviada: noop,
        trackEcoDemorou: noop,
        trackBlocoTecnico: noop,
        identifyUsuario: noop,
        trackSessaoEntrouChat: noop,
    });
    const entrada = "Oi!\nEu sou a Eco, não a Ana(.";
    const resultado = await finalizer.finalize({
        raw: entrada,
        ultimaMsg: entrada,
        userName: "Ana(",
        hasAssistantBefore: false,
        mode: "fast",
        startedAt: Date.now(),
    });
    strict_1.default.strictEqual(resultado.message, "Oi!");
});
//# sourceMappingURL=responseFinalizer.test.js.map