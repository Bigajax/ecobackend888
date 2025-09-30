import test from "node:test";
import assert from "node:assert/strict";

const Module = require("node:module");

type StubMap = Record<string, unknown>;

type Loader<T> = () => Promise<T> | T;

const withPatchedModules = async <T>(stubs: StubMap, loader: Loader<T>): Promise<T> => {
  const originalLoad = Module._load;
  Module._load = function patched(request: string, parent: any, isMain: boolean) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return await loader();
  } finally {
    Module._load = originalLoad;
  }
};

const loadRouterWithStubs = async (modulePath: string, stubs: StubMap) => {
  return withPatchedModules(stubs, () => {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
    const mod = require(modulePath);
    return mod.default ?? mod;
  });
};

const getRouteHandler = (router: any, path: string, index = 0) => {
  const layer = router.stack.find((entry: any) => entry.route?.path === path);
  if (!layer) throw new Error(`Route ${path} not found`);
  const stackEntry = layer.route.stack[index];
  if (!stackEntry) throw new Error(`Handler ${index} for route ${path} not found`);
  return stackEntry.handle;
};

const makeResponse = () => {
  return {
    statusCode: 200,
    headers: new Map<string, string>(),
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.payload = data;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value);
    },
  };
};

test("/ask-eco dispara trackMensagemRecebida com metadados básicos", async () => {
  const trackCalls: any[] = [];

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
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      isDebug: () => false,
    },
    "../analytics/events/mixpanelEvents": {
      trackMensagemRecebida: (payload: unknown) => {
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
  } as any;

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(trackCalls.length, 1);

  const event = trackCalls[0];
  assert.equal(event.distinctId, "distinct-1");
  assert.equal(event.userId, "user-1");
  assert.equal(event.origem, "texto");
  assert.equal(event.tipo, "inicial");
  assert.equal(event.tamanhoCaracteres, "Oi Eco".length);
  assert.equal(event.sessaoId, "sessao-xyz");
  assert.equal(event.origemSessao, "app-mobile");
  assert.ok(typeof event.timestamp === "string");
  assert.ok(!Number.isNaN(Date.parse(event.timestamp)));
});

test("rota de voz dispara trackMensagemRecebida com bytes e duração", async () => {
  const trackCalls: any[] = [];

  const router = await loadRouterWithStubs("../../routes/voiceFullRoutes", {
    multer: Object.assign(
      (options: unknown) => ({
        single: () => (_req: any, _res: any, next: any) => next(),
      }),
      { memoryStorage: () => ({}) }
    ),
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
      trackMensagemRecebida: (payload: unknown) => {
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
  } as any;

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(trackCalls.length, 1);

  const event = trackCalls[0];
  assert.equal(event.origem, "voz");
  assert.equal(event.tipo, "continuacao");
  assert.equal(event.tamanhoBytes, 6);
  assert.equal(event.duracaoMs, 1800);
  assert.equal(event.tamanhoCaracteres, "fala transcrita".length);
  assert.equal(event.userId, "user-voz");
  assert.equal(event.distinctId, "distinct-voz");
  assert.equal(event.sessaoId, "sessao-voz");
  assert.equal(event.origemSessao, "app-mobile");
  assert.ok(typeof event.timestamp === "string");
  assert.ok(!Number.isNaN(Date.parse(event.timestamp)));
});
