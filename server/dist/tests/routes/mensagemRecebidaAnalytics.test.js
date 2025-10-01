"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const Module = require("node:module");
const withPatchedModules = async (stubs, loader) => {
    const originalLoad = Module._load;
    Module._load = function patched(request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return originalLoad(request, parent, isMain);
    };
    try {
        return await loader();
    }
    finally {
        Module._load = originalLoad;
    }
};
const loadRouterWithStubs = async (modulePath, stubs) => {
    return withPatchedModules(stubs, () => {
        const resolved = require.resolve(modulePath);
        delete require.cache[resolved];
        const mod = require(modulePath);
        return mod.default ?? mod;
    });
};
const getRouteHandler = (router, path, index = 0) => {
    const layer = router.stack.find((entry) => entry.route?.path === path);
    if (!layer)
        throw new Error(`Route ${path} not found`);
    const stackEntry = layer.route.stack[index];
    if (!stackEntry)
        throw new Error(`Handler ${index} for route ${path} not found`);
    return stackEntry.handle;
};
const makeResponse = () => {
    return {
        statusCode: 200,
        headers: new Map(),
        payload: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.payload = data;
            return this;
        },
        setHeader(name, value) {
            this.headers.set(name.toLowerCase(), value);
        },
    };
};
(0, node_test_1.default)("/ask-eco dispara trackMensagemRecebida com metadados básicos", async () => {
    const trackCalls = [];
    const router = await loadRouterWithStubs("../../routes/openrouterRoutes", {
        "../lib/supabaseAdmin": {
            supabase: {
                auth: {
                    getUser: async () => ({ data: { user: { id: "supabase-user" } }, error: null }),
                },
            },
        },
        "../services/ConversationOrchestrator": {
            getEcoResponse: async () => ({ message: "eco" }),
        },
        "../adapters/embeddingService": {
            embedTextoCompleto: async () => [],
        },
        "../services/buscarMemorias": {
            buscarMemoriasSemelhantes: async () => [],
        },
        "../services/promptContext": {
            ContextBuilder: {
                build: async () => "prompt",
            },
        },
        "../services/promptContext/logger": {
            log: {
                info: () => { },
                warn: () => { },
                error: () => { },
                debug: () => { },
            },
            isDebug: () => false,
        },
        "../analytics/events/mixpanelEvents": {
            trackMensagemRecebida: (payload) => {
                trackCalls.push(payload);
            },
        },
    });
    const handler = getRouteHandler(router, "/ask-eco");
    const res = makeResponse();
    const req = {
        body: {
            usuario_id: "user-1",
            messages: [{ role: "user", content: "Oi Eco" }],
            sessionMeta: {
                distinctId: "distinct-1",
                sessaoId: "sessao-xyz",
                origem: "app-mobile",
            },
        },
        headers: {
            authorization: "Bearer token-123",
        },
    };
    await handler(req, res);
    strict_1.default.equal(res.statusCode, 200);
    strict_1.default.equal(trackCalls.length, 1);
    const event = trackCalls[0];
    strict_1.default.equal(event.distinctId, "distinct-1");
    strict_1.default.equal(event.userId, "user-1");
    strict_1.default.equal(event.origem, "texto");
    strict_1.default.equal(event.tipo, "inicial");
    strict_1.default.equal(event.tamanhoCaracteres, "Oi Eco".length);
    strict_1.default.equal(event.sessaoId, "sessao-xyz");
    strict_1.default.equal(event.origemSessao, "app-mobile");
    strict_1.default.ok(typeof event.timestamp === "string");
    strict_1.default.ok(!Number.isNaN(Date.parse(event.timestamp)));
});
(0, node_test_1.default)("rota de voz dispara trackMensagemRecebida com bytes e duração", async () => {
    const trackCalls = [];
    const router = await loadRouterWithStubs("../../routes/voiceFullRoutes", {
        multer: Object.assign((options) => ({
            single: () => (_req, _res, next) => next(),
        }), { memoryStorage: () => ({}) }),
        "../services/elevenlabsService": {
            generateAudio: async () => Buffer.from("eco-audio"),
        },
        "../services/ConversationOrchestrator": {
            getEcoResponse: async () => ({ message: "eco resposta" }),
        },
        "../scripts/transcribe": {
            transcribeWithWhisper: async () => "fala transcrita",
        },
        "../analytics/events/mixpanelEvents": {
            trackMensagemRecebida: (payload) => {
                trackCalls.push(payload);
            },
        },
    });
    const handler = getRouteHandler(router, "/transcribe-and-respond", 1);
    const res = makeResponse();
    const req = {
        body: {
            usuario_id: "user-voz",
            mensagens: JSON.stringify([
                { role: "assistant", content: "oi" },
                { role: "user", content: "fala transcrita" },
            ]),
            access_token: "token-xyz",
            audioDurationMs: 1800,
            sessionMeta: {
                distinctId: "distinct-voz",
                origem: "app-mobile",
                sessaoId: "sessao-voz",
            },
        },
        file: {
            buffer: Buffer.from("abcdef"),
        },
    };
    await handler(req, res);
    strict_1.default.equal(res.statusCode, 200);
    strict_1.default.equal(trackCalls.length, 1);
    const event = trackCalls[0];
    strict_1.default.equal(event.origem, "voz");
    strict_1.default.equal(event.tipo, "continuacao");
    strict_1.default.equal(event.tamanhoBytes, 6);
    strict_1.default.equal(event.duracaoMs, 1800);
    strict_1.default.equal(event.tamanhoCaracteres, "fala transcrita".length);
    strict_1.default.equal(event.userId, "user-voz");
    strict_1.default.equal(event.distinctId, "distinct-voz");
    strict_1.default.equal(event.sessaoId, "sessao-voz");
    strict_1.default.equal(event.origemSessao, "app-mobile");
    strict_1.default.ok(typeof event.timestamp === "string");
    strict_1.default.ok(!Number.isNaN(Date.parse(event.timestamp)));
});
//# sourceMappingURL=mensagemRecebidaAnalytics.test.js.map