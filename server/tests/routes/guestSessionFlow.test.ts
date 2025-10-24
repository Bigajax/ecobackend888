import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

const Module = require("node:module");

type StubMap = Record<string, unknown>;

type AnalyticsOperation =
  | { type: "insert" | "upsert" | "update"; table: string; payload: unknown }
  | { type: "rpc"; fn: string; args: Record<string, unknown> };

const withPatchedModules = async <T>(stubs: StubMap, loader: () => Promise<T> | T) => {
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

const getRouteHandler = (router: any, path: string) => {
  const layer = router.stack.find((entry: any) => entry.route?.path === path);
  if (!layer) throw new Error(`Route ${path} not found`);
  const handler = layer.route.stack[0]?.handle;
  if (!handler) throw new Error(`Handler for route ${path} not found`);
  return handler;
};

const createAnalyticsStub = (operations: AnalyticsOperation[]) => {
  const makeQuery = (table: string) => ({
    insert: async (rows: unknown) => {
      operations.push({ type: "insert", table, payload: rows });
      return { error: null };
    },
    upsert: (rows: unknown) => ({
      select: async () => {
        operations.push({ type: "upsert", table, payload: rows });
        return { data: rows, error: null };
      },
    }),
    update: (payload: unknown) => ({
      eq: async () => {
        operations.push({ type: "update", table, payload });
        return { error: null };
      },
    }),
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: null, error: { code: "PGRST116" } }),
          }),
        }),
      }),
    }),
    eq: () => makeQuery(table),
  });

  return {
    from: (table: string) => makeQuery(table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      operations.push({ type: "rpc", fn, args });
      return { error: null };
    },
  };
};

const DEFAULT_USUARIO_ID = "d3a1f4c2-5b6d-4e7f-9a10-bcdef1234567";

class MockRequest extends EventEmitter {
  body: any;
  headers: Record<string, string>;
  method = "POST";
  query: Record<string, unknown> = {};
  ip = "127.0.0.1";
  path: string;
  originalUrl: string;
  guest: { id?: string } = {};
  guestId?: string;
  user?: { id?: string };

  constructor(path: string, body: any, headers: Record<string, string>) {
    super();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const normalized = { ...body } as Record<string, any>;
      const textoRaw =
        typeof normalized.texto === "string" ? normalized.texto.trim() : "";
      if (!textoRaw) {
        const firstUserMessage = Array.isArray(normalized.messages)
          ? normalized.messages.find(
              (msg: any) =>
                msg && typeof msg.content === "string" && msg.role === "user"
            )?.content
          : null;
        const fallbackTexto =
          typeof firstUserMessage === "string" && firstUserMessage.trim()
            ? firstUserMessage.trim()
            : "Olá";
        normalized.texto = fallbackTexto;
      } else {
        normalized.texto = textoRaw;
      }

      const usuarioIdRaw =
        typeof normalized.usuario_id === "string" && normalized.usuario_id.trim()
          ? normalized.usuario_id.trim()
          : DEFAULT_USUARIO_ID;
      normalized.usuario_id = usuarioIdRaw;
      this.body = normalized;
    } else {
      this.body = body;
    }
    this.headers = headers;
    this.path = path;
    this.originalUrl = path;
  }

  get(name: string) {
    const key = name.toLowerCase();
    return this.headers[key];
  }
}

class MockResponse {
  statusCode = 200;
  headers = new Map<string, string>();
  chunks: string[] = [];
  payload: unknown = null;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  write(chunk: string | Buffer) {
    const text = typeof chunk === "string" ? chunk : chunk.toString();
    this.chunks.push(text);
    return true;
  }

  end() {
    return this;
  }

  json(payload: unknown) {
    this.payload = payload;
    return this;
  }
}

test("guest flow completes ask-eco, signal and feedback", async () => {
  const operations: AnalyticsOperation[] = [];
  const analyticsStub = createAnalyticsStub(operations);
  const supabaseClientStub = {
    analyticsClientMode: "enabled" as const,
    getAnalyticsClient: () => analyticsStub,
    supabase: null,
  };

  const guestId = randomUUID();
  const interactionId = randomUUID();

  const baseStubs: StubMap = {
    "../services/supabaseClient": supabaseClientStub,
    "../services/promptContext/logger": {
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    },
  };

  const promptRouter = await loadRouterWithStubs("../../routes/promptRoutes", {
    ...baseStubs,
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        if (params.stream?.onEvent) {
          await params.stream.onEvent({ type: "prompt_ready" });
          await params.stream.onEvent({ type: "chunk", delta: "hello" });
          await params.stream.onEvent({
            type: "done",
            meta: { interaction_id: interactionId, modelo: "stub-model" },
          });
        }
        return {
          raw: "hello world",
          meta: { interaction_id: interactionId },
          modelo: "stub-model",
        };
      },
    },
    "../services/conversation/interactionAnalytics": {
      createInteraction: async () => interactionId,
    },
    "../lib/supabaseAdmin": { getSupabaseAdmin: () => null },
  });

  const askEcoHandler = getRouteHandler(promptRouter, "/ask-eco");
  const askReq = new MockRequest(
    "/api/ask-eco",
    {
      stream: true,
      messages: [{ role: "user", content: "Olá" }],
    },
    {
      accept: "text/event-stream",
      "content-type": "application/json",
      "x-eco-guest-id": guestId,
    }
  );
  askReq.guest = { id: guestId };
  askReq.guestId = guestId;
  const askRes = new MockResponse();

  await askEcoHandler(askReq as any, askRes as any);

  assert.equal(askRes.statusCode, 200, "ask-eco should respond 200");
  const ssePayload = askRes.chunks.join("");
  assert.ok(
    ssePayload.includes(
      `event: control\ndata: {"name":"prompt_ready","interaction_id":"${interactionId}"}`,
    ),
    "SSE should announce prompt_ready",
  );
  assert.ok(
    ssePayload.includes('event: control\ndata: {"name":"done"}'),
    "SSE should finish with done control event",
  );
  assert.ok(!ssePayload.includes("data: ok"), "SSE payload should avoid ok bodies");

  const { registrarSignal } = await withPatchedModules(baseStubs, () => {
    const resolved = require.resolve("../../controllers/signalController");
    delete require.cache[resolved];
    return require("../../controllers/signalController");
  });

  const signalReq = new MockRequest(
    "/api/signal",
    { interaction_id: interactionId, signal: "view" },
    { "content-type": "application/json", "x-eco-guest-id": guestId }
  );
  const signalRes = new MockResponse();
  await registrarSignal(signalReq as any, signalRes as any);
  assert.equal(signalRes.statusCode, 204, "signal endpoint should return 204");

  const { registrarFeedback } = await withPatchedModules(baseStubs, () => {
    const resolved = require.resolve("../../controllers/feedbackController");
    delete require.cache[resolved];
    return require("../../controllers/feedbackController");
  });

  const feedbackReq = new MockRequest(
    "/api/feedback",
    { interaction_id: interactionId, vote: "up" },
    { "content-type": "application/json", "x-eco-guest-id": guestId }
  );
  const feedbackRes = new MockResponse();
  await registrarFeedback(feedbackReq as any, feedbackRes as any);
  assert.equal(feedbackRes.statusCode, 204, "feedback endpoint should return 204");

  const signalInsert = operations.find((op) => op.type === "insert" && op.table === "eco_passive_signals");
  assert.ok(signalInsert, "passive signal should be persisted");
  const feedbackInsert = operations.find((op) => op.type === "insert" && op.table === "eco_feedback");
  assert.ok(feedbackInsert, "feedback should be persisted");
});
