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

const getRouteHandler = (router: any, path: string, method = "post") => {
  const normalizedMethod = method.toLowerCase();
  // O default export de promptRoutes monta o askEcoRouter em "/ask-eco" (router.use),
  // e o askEcoRouter registra as rotas em "/". Recursa nos sub-routers e aceita
  // tanto o path explícito quanto "/".
  const search = (stack: any[]): any => {
    for (const entry of stack) {
      if (
        entry.route &&
        (entry.route.path === path || entry.route.path === "/") &&
        entry.route.methods?.[normalizedMethod]
      ) {
        // A rota é (ensureIdentity, handleAskEcoRequest); queremos o handler
        // PRINCIPAL (o último), não o middleware de identidade.
        const candidates = entry.route.stack.filter(
          (e: any) => e.method === normalizedMethod,
        );
        const handler = candidates[candidates.length - 1]?.handle;
        if (handler) return handler;
      }
      if (entry.handle?.stack) {
        const nested = search(entry.handle.stack);
        if (nested) return nested;
      }
    }
    return null;
  };

  const handler = search(router.stack);
  if (!handler) throw new Error(`Route ${path} not found`);
  return handler;
};

const parseSsePayloads = (raw: string) =>
  raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s*/, ""))
        .join("");
      if (!data) return null;
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    })
    .filter((payload): payload is Record<string, unknown> => payload !== null);

const createAnalyticsStub = (operations: AnalyticsOperation[]) => {
  const makeQuery = (table: string) => ({
    // insert suporta tanto `await insert(...)` (signal) quanto
    // `insert(...).select(...)` (bandit_rewards do feedback).
    insert: (rows: unknown) => {
      operations.push({ type: "insert", table, payload: rows });
      const awaitable: any = Promise.resolve({ error: null });
      awaitable.select = async () => ({
        data: Array.isArray(rows) ? rows : [rows],
        error: null,
      });
      return awaitable;
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
        // Verify direto de interação (signal/feedback): retorna uma linha válida.
        maybeSingle: async () => ({
          data: {
            id: "interaction",
            message_id: null,
            prompt_hash: null,
            user_id: null,
            session_id: null,
          },
          error: null,
        }),
        // Inferência de braço (eco_module_usages): nenhum módulo → braço baseline.
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
      // O validador de ask-eco exige um clientMessageId (body ou header).
      const hasClientMessageId =
        typeof normalized.clientMessageId === "string" ||
        typeof normalized.client_message_id === "string" ||
        typeof normalized.messageId === "string" ||
        typeof normalized.message_id === "string" ||
        typeof headers["x-eco-client-message-id"] === "string";
      if (!hasClientMessageId) {
        normalized.clientMessageId = randomUUID();
      }
      this.body = normalized;
    } else {
      this.body = body;
    }
    // SSE com stream exige origin permitido (sem origin → 403 origin_blocked).
    if (typeof headers.origin !== "string") {
      headers = { ...headers, origin: "http://localhost:5173" };
    }
    this.headers = headers;
    this.path = path;
    this.originalUrl = path;
  }

  get(name: string) {
    const key = name.toLowerCase();
    return this.headers[key];
  }

  header(name: string) {
    return this.get(name);
  }

  is(type: string) {
    const contentType = (this.headers["content-type"] || "").toLowerCase();
    if (!contentType) return false;
    if (type.includes("json")) {
      return contentType.includes("application/json") ? "application/json" : false;
    }
    return contentType.includes(type.toLowerCase()) ? type : false;
  }
}

class MockResponse {
  statusCode = 200;
  headers = new Map<string, string>();
  chunks: string[] = [];
  payload: unknown = null;
  ended = false;
  flushed = false;
  headersFlushed = false;
  headersSent = false;
  locals: Record<string, unknown> = {};
  socket = { setTimeout() {}, setKeepAlive() {} };

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name: string) {
    return this.headers.get(name.toLowerCase());
  }

  removeHeader(name: string) {
    const key = name.toLowerCase();
    this.headers.delete(key);
    if (key === "content-encoding") {
      this.headers.set(key, "identity");
    }
  }

  hasHeader(name: string) {
    return this.headers.has(name.toLowerCase());
  }

  writeHead(code: number, headersObj?: Record<string, string>) {
    this.statusCode = code;
    if (headersObj) {
      for (const [name, value] of Object.entries(headersObj)) {
        this.setHeader(name, value);
      }
    }
    this.headersFlushed = true;
    return this;
  }

  write(chunk: string | Buffer) {
    const text = typeof chunk === "string" ? chunk : chunk.toString();
    this.chunks.push(text);
    return true;
  }

  end() {
    this.ended = true;
    return this;
  }

  flush() {
    this.flushed = true;
  }

  flushHeaders() {
    this.headersFlushed = true;
  }

  on() {
    return this;
  }

  json(payload: unknown) {
    this.payload = payload;
    this.chunks.push(JSON.stringify(payload));
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

  const loggerStub: any = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
  };
  loggerStub.withContext = () => loggerStub;
  const baseStubs: StubMap = {
    "../services/supabaseClient": supabaseClientStub,
    "../services/promptContext/logger": { log: loggerStub },
  };

  const promptRouter = await loadRouterWithStubs("../../routes/promptRoutes", {
    ...baseStubs,
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        if (params.stream?.onEvent) {
          await params.stream.onEvent({ type: "chunk", delta: "hello" });
          await params.stream.onChunk?.({ index: 0, text: "hello" });
          await params.stream.onEvent({
            type: "done",
            meta: { interaction_id: interactionId, modelo: "stub-model" },
          });
          await params.stream.onChunk?.({ done: true, meta: { interaction_id: interactionId } });
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
  const payloads = parseSsePayloads(ssePayload);
  assert.ok(payloads.length >= 2, "SSE should include chunks and done payload");
  // A SSE atual carrega o discriminador "type" em cada payload (prompt_ready /
  // chunk / done / meta); os chunks de texto usam o campo "delta".
  const chunkPayloads = payloads.filter((payload) => (payload as any).type === "chunk") as any[];
  assert.ok(chunkPayloads.length >= 1, "SSE should include at least one text chunk");
  assert.ok(
    chunkPayloads.some((payload) => payload.delta === "hello"),
    "Chunk payload should include the streamed text",
  );
  const donePayload = payloads.find((payload) => (payload as any).done === true) as any;
  assert.ok(donePayload, "SSE should finish with done payload");
  assert.equal(donePayload!.type, "done");
  assert.ok(!payloads.some((payload) => typeof payload.text === "string" && payload.text.trim().toLowerCase() === "ok"));

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
