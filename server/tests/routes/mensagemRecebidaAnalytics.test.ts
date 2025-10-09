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
  const events: Array<Record<string, unknown>> = [];
  return {
    statusCode: 200,
    headers: new Map<string, string>(),
    payload: undefined as unknown,
    events,
    ended: false,
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
    write(chunk: Buffer | string) {
      const text = chunk.toString();
      const parts = text.split("\n\n").filter(Boolean);
      for (const part of parts) {
        const dataLine = part
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const json = dataLine.replace(/^data: /, "");
        try {
          events.push(JSON.parse(json));
        } catch {
          // ignora payloads que não são JSON válidos durante os testes
        }
      }
    },
    end() {
      this.ended = true;
    },
    flush() {},
    flushHeaders() {},
  };
};

test("/ask-eco delega prompt ao orquestrador e propaga eventos de prompt_ready", async () => {
  const trackCalls: any[] = [];
  const orchestratorCalls: any[] = [];

  const router = await loadRouterWithStubs("../../routes/openrouterRoutes", {
    "../lib/supabaseAdmin": {
      supabase: {
        auth: {
          getUser: async () => ({ data: { user: { id: "supabase-user" } }, error: null }),
        },
      },
    },
    "../adapters/EmbeddingAdapter": {
      getEmbeddingCached: async () => [],
    },
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        orchestratorCalls.push(params);
        if (params.stream) {
          await params.stream.onEvent({
            type: "control",
            name: "prompt_ready",
            timings: { cache: false },
          });
          await params.stream.onEvent({ type: "control", name: "first_token" });
          await params.stream.onEvent({
            type: "chunk",
            content: "eco resposta",
            index: 0,
          });
          await params.stream.onEvent({
            type: "control",
            name: "done",
            meta: { length: "eco resposta".length, modelo: "teste" },
            timings: { cache: false },
          });
        }
        return {
          raw: "eco resposta",
          modelo: "teste",
          usage: { total_tokens: 42 },
          timings: { cache: false },
          finalize: async () => ({ raw: "eco resposta" }),
        };
      },
    },
    "../analytics/events/mixpanelEvents": {
      trackMensagemRecebida: (payload: unknown) => {
        trackCalls.push(payload);
      },
      trackEcoCache: () => {},
      trackGuestMessage: () => {},
      trackGuestStart: () => {},
      trackGuestClaimed: () => {},
    },
    "../services/promptContext/logger": {
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
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
    on() {},
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

  assert.equal(orchestratorCalls.length, 1);
  const orchestratorParams = orchestratorCalls[0];
  assert.equal(orchestratorParams.promptOverride, undefined);
  assert.equal(orchestratorParams.mems, undefined);

  const promptReady = res.events.find((payload) => payload.type === "prompt_ready");
  assert.ok(promptReady, "espera prompt_ready vindo do orquestrador");
  const chunk = res.events.find((payload) => payload.type === "chunk");
  assert.equal(chunk?.delta, "eco resposta");
});

test("/ask-eco aceita modo convidado sem token e marca métricas", async () => {
  const guestId = "9f7d3b48-9a15-4a0c-9d7c-1234567890ab";
  const guestInteractions: string[] = [];
  const guestEvents: any[] = [];
  const orchestratorCalls: any[] = [];

  const router = await loadRouterWithStubs("../../routes/openrouterRoutes", {
    "../lib/supabaseAdmin": {
      supabase: { auth: { getUser: async () => ({ data: null, error: null }) } },
    },
    "../adapters/EmbeddingAdapter": {
      getEmbeddingCached: async () => [],
    },
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        orchestratorCalls.push(params);
        return {
          raw: "guest resposta",
          modelo: "teste",
          usage: null,
          timings: {},
          finalize: async () => ({ raw: "guest resposta" }),
        };
      },
    },
    "../analytics/events/mixpanelEvents": {
      trackMensagemRecebida: () => {},
      trackEcoCache: () => {},
      trackGuestMessage: (payload: unknown) => {
        guestEvents.push({ type: "message", payload });
      },
      trackGuestStart: (payload: unknown) => {
        guestEvents.push({ type: "start", payload });
      },
      trackGuestClaimed: () => {},
    },
    "../core/http/middlewares/guestSession": {
      guestSessionConfig: { maxInteractions: 6, rateLimit: { limit: 30, windowMs: 60000 } },
      incrementGuestInteraction: (id: string) => {
        guestInteractions.push(id);
        return guestInteractions.length;
      },
    },
    "../services/promptContext/logger": {
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    },
  });

  const handler = getRouteHandler(router, "/ask-eco");
  const res = makeResponse();
  const req = {
    body: {
      messages: [{ role: "user", content: "Oi Eco" }],
      sessionMeta: {},
    },
    headers: {
      "x-guest-id": guestId,
      "x-guest-mode": "1",
    },
    guest: {
      id: guestId,
      ip: "127.0.0.1",
      interactionsUsed: 0,
      maxInteractions: 6,
      rateLimit: { limit: 30, remaining: 29, resetAt: Date.now() + 60000 },
    },
    on() {},
  } as any;

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(guestInteractions.length, 1);
  assert.equal(guestEvents.length, 2);
  const startEvent = guestEvents.find((evt) => evt.type === "start");
  assert.ok(startEvent, "espera evento guest_start");
  const orchestratorParams = orchestratorCalls[0];
  assert.equal(orchestratorParams.isGuest, true);
  assert.equal(orchestratorParams.guestId, guestId);
});

test("/ask-eco permite fallback JSON quando stream=false", async () => {
  const guestId = "guest-json-test";
  const orchestratorCalls: any[] = [];

  const router = await loadRouterWithStubs("../../routes/openrouterRoutes", {
    "../lib/supabaseAdmin": {
      supabase: { auth: { getUser: async () => ({ data: null, error: null }) } },
    },
    "../adapters/EmbeddingAdapter": {
      getEmbeddingCached: async () => [],
    },
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        orchestratorCalls.push(params);
        if (params.stream) {
          await params.stream.onEvent({
            type: "control",
            name: "prompt_ready",
            timings: { llmStart: 1 },
          });
          await params.stream.onEvent({ type: "chunk", content: "resposta convidado", index: 0 });
          await params.stream.onEvent({
            type: "control",
            name: "done",
            meta: { length: "resposta convidado".length },
            timings: { llmEnd: 2 },
          });
        }
        return {
          raw: "resposta convidado",
          modelo: "teste",
          usage: null,
          timings: { llmEnd: 2 },
          finalize: async () => ({ raw: "resposta convidado" }),
        };
      },
    },
    "../analytics/events/mixpanelEvents": {
      trackMensagemRecebida: () => {},
      trackEcoCache: () => {},
      trackGuestMessage: () => {},
      trackGuestStart: () => {},
      trackGuestClaimed: () => {},
    },
    "../core/http/middlewares/guestSession": {
      guestSessionConfig: { maxInteractions: 6, rateLimit: { limit: 30, windowMs: 60000 } },
      incrementGuestInteraction: () => 1,
    },
    "../services/promptContext/logger": {
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    },
  });

  const handler = getRouteHandler(router, "/ask-eco");
  const res = makeResponse();
  const req = {
    body: { messages: [{ role: "user", content: "Oi" }] },
    query: { stream: "false" },
    headers: {
      "x-guest-id": guestId,
      "x-guest-mode": "1",
    },
    guest: { id: guestId },
    on() {},
  } as any;

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.events.length, 0);
  assert.equal(orchestratorCalls.length, 1);

  const payload = res.payload as any;
  assert.equal(payload?.ok, true);
  assert.equal(payload?.stream, false);
  assert.equal(payload?.message, "resposta convidado");
  assert.ok(Array.isArray(payload?.events));
  assert.ok(payload.events.some((event: any) => event?.type === "chunk"));
  assert.ok(payload.events.some((event: any) => event?.type === "done"));
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
