import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  STREAM_TIMEOUT_MESSAGE,
  StreamSession,
  HEARTBEAT_INTERVAL_MS,
} from "../../routes/askEco/streaming";

const Module = require("node:module");

type StubMap = Record<string, unknown>;

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
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[normalizedMethod]
  );
  if (!layer) throw new Error(`Route ${path} not found`);
  const handler = layer.route.stack.find((stackEntry: any) => stackEntry.method === normalizedMethod)
    ?.handle;
  if (!handler) throw new Error(`Handler for route ${path} not found`);
  return handler;
};

const DEFAULT_USUARIO_ID = "c5c5b1af-5f6c-4e5f-8cb4-7a6d12345678";
const TEST_GUEST_ID = "0c9c8b7a-6d5e-4f3a-8123-b4567890abcd";
const TIMEOUT_GUEST_ID = "22222222-2222-4222-8222-222222222222";
const TEST_INTERACTION_ID = "11111111-1111-4111-8111-111111111111";

class MockRequest extends EventEmitter {
  body: any;
  headers: Record<string, string>;
  method = "POST";
  query: Record<string, unknown> = {};
  ip = "127.0.0.1";
  path = "/api/ask-eco";
  originalUrl = "/api/ask-eco";
  guest: { id?: string } = {};
  guestId?: string;
  user?: { id?: string };

  constructor(body: any, headers: Record<string, string>) {
    super();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const normalized = { ...body } as Record<string, any>;
      const existingTexto =
        typeof normalized.texto === "string" ? normalized.texto.trim() : "";
      if (!existingTexto) {
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
        normalized.texto = existingTexto;
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
  ended = false;
  flushed = false;
  headersFlushed = false;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  write(chunk: string | Buffer) {
    const payload = typeof chunk === "string" ? chunk : chunk.toString();
    this.chunks.push(payload);
    return true;
  }

  end() {
    this.ended = true;
  }

  flush() {
    this.flushed = true;
  }

  flushHeaders() {
    this.headersFlushed = true;
  }

  json(payload: unknown) {
    this.chunks.push(JSON.stringify(payload));
    return this;
  }
}

test("SSE streaming emits tokens, done and disables compression", async () => {
  const router = await loadRouterWithStubs("../../routes/promptRoutes", {
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        if (params.stream?.onEvent) {
          await params.stream.onEvent({ type: "chunk", delta: "primeiro" });
          await params.stream.onEvent({
            type: "chunk",
            delta: { content: "segundo" },
          });
          await params.stream.onEvent({
            type: "done",
            meta: { finishReason: "stop" },
          });
        }
        return { raw: "resultado" };
      },
    },
    "../services/conversation/interactionAnalytics": {
      createInteraction: async () => TEST_INTERACTION_ID,
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

  const req = new MockRequest(
    {
      stream: true,
      messages: [{ role: "user", content: "Olá" }],
    },
    {
      accept: "text/event-stream",
      "content-type": "application/json",
    }
  );
  req.guest = { id: TEST_GUEST_ID };
  req.guestId = TEST_GUEST_ID;

  const res = new MockResponse();

  await handler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(res.headers.get("content-encoding"), "identity");
  assert.equal(res.headers.get("x-no-compression"), "1");
  assert.equal(res.headers.get("cache-control"), "no-cache, no-transform");
  assert.equal(res.headers.get("connection"), "keep-alive");
  assert.equal(res.ended, true, "stream should close after done event");
  assert.ok(res.flushed, "safeWrite should flush chunks for SSE");

  const output = res.chunks.join("");
  assert.ok(res.chunks.length > 0, "should emit at least one SSE chunk");
  assert.equal(
    res.chunks[0],
    `event: interaction\\ndata: {"interaction_id":"${TEST_INTERACTION_ID}"}\\n\\n`,
    "first SSE event should share interaction_id"
  );
  const finalChunk = res.chunks[res.chunks.length - 1];
  assert.equal(
    finalChunk,
    "event: done\\ndata: ok\\n\\n",
    "should append explicit done event before closing"
  );
  assert.ok(!output.includes("event: ping"), "should no longer emit ping events");
  assert.ok(!output.includes(":keepalive"), "heartbeat comment should omit legacy keepalive tag");
  const tokenCount = (output.match(/event: token/g) ?? []).length;
  assert.ok(tokenCount >= 2, "should emit streamed token events");
  assert.ok(!output.includes("__prompt_ready__"), "should not emit synthetic prompt_ready token");
  assert.ok(/event: control/.test(output), "should emit control events");
  assert.ok(
    output.includes('event: first_token\ndata: {"delta":"primeiro"}'),
    "should emit first_token event with first delta"
  );
  assert.ok(
    output.includes('event: chunk\ndata: {"delta":"primeiro","index":0}'),
    "should emit chunk event for first delta with index 0"
  );
  assert.ok(
    output.includes('event: chunk\ndata: {"delta":"segundo","index":1}'),
    "should emit chunk event for subsequent deltas with incrementing index"
  );
  assert.ok(
    /event: control\ndata: {"name":"done"/.test(output),
    "should emit control:done event"
  );
  assert.ok(
    /"totalChunks":2/.test(output),
    "done payload should include totalChunks"
  );
});

test("SSE streaming triggers timeout fallback when orchestrator stalls", async () => {
  const previousTimeout = process.env.ECO_SSE_TIMEOUT_MS;
  process.env.ECO_SSE_TIMEOUT_MS = "10";

  const router = await loadRouterWithStubs("../../routes/promptRoutes", {
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        if (params.stream?.onEvent) {
          // não emite nenhum chunk para disparar fallback
        }
        return new Promise((resolve) => setTimeout(() => resolve({ raw: "" }), 50));
      },
    },
    "../services/conversation/interactionAnalytics": {
      createInteraction: async () => TEST_INTERACTION_ID,
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

  const req = new MockRequest(
    {
      stream: true,
      messages: [{ role: "user", content: "Olá" }],
    },
    {
      accept: "text/event-stream",
      "content-type": "application/json",
    }
  );
  req.guest = { id: TIMEOUT_GUEST_ID };
  req.guestId = TIMEOUT_GUEST_ID;

  const res = new MockResponse();

  try {
    await handler(req as any, res as any);

    const output = res.chunks.join("");
    assert.equal(
      res.chunks[0],
      `event: interaction\\ndata: {"interaction_id":"${TEST_INTERACTION_ID}"}\\n\\n`,
      "interaction event should be emitted before timeout handling"
    );
    assert.match(output, /event: first_token/, "fallback should emit first_token event");
    assert.match(
      output,
      new RegExp(STREAM_TIMEOUT_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "fallback chunk should contain timeout message"
    );
    assert.match(output, /event: control/, "fallback should emit control events");
    assert.match(
      output,
      /event: control\ndata: {"name":"done"/,
      "fallback should complete stream with control:done"
    );
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.ECO_SSE_TIMEOUT_MS;
    } else {
      process.env.ECO_SSE_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("StreamSession heartbeats use comments and close with done event", async () => {
  assert.ok(
    HEARTBEAT_INTERVAL_MS >= 20_000 && HEARTBEAT_INTERVAL_MS <= 30_000,
    "heartbeat interval should fall within 20-30 seconds"
  );

  const req = new EventEmitter();
  const res = new MockResponse();
  const tracer = {
    markPromptReady: () => {},
    markFirstToken: () => {},
    markTotal: () => {},
    addError: () => {},
    snapshot: () => ({}),
  } as any;

  let capturedInterval: number | null = null;
  let heartbeatCallback: (() => void) | null = null;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;

  try {
    (global as any).setInterval = ((fn: () => void, ms: number) => {
      capturedInterval = ms;
      heartbeatCallback = fn;
      return { ref: Symbol("interval") } as unknown as NodeJS.Timeout;
    }) as typeof setInterval;
    (global as any).clearInterval = () => {};

    const session = new StreamSession({
      req: req as any,
      res: res as any,
      respondAsStream: true,
      activationTracer: tracer,
      startTime: 0,
      debugRequested: false,
    });

    session.initialize(false);

    assert.equal(
      capturedInterval,
      HEARTBEAT_INTERVAL_MS,
      "should schedule heartbeat using configured interval"
    );
    assert.ok(heartbeatCallback, "should capture heartbeat callback");

    heartbeatCallback?.();
    assert.ok(
      res.chunks.includes(":\n\n"),
      "heartbeat callback should write SSE comment"
    );

    session.end();
    assert.equal(
      res.chunks[res.chunks.length - 1],
      "event: done\ndata: ok\n\n",
      "StreamSession should append explicit done event on end"
    );

    const chunksAfterEnd = res.chunks.length;
    heartbeatCallback?.();
    assert.equal(
      res.chunks.length,
      chunksAfterEnd,
      "heartbeat callback should be ignored after end"
    );
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test("HEAD /api/ask-eco responds 200 with CORS headers", async () => {
  const router = await loadRouterWithStubs("../../routes/promptRoutes", {
    "../services/promptContext/logger": {
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    },
  });

  const handler = getRouteHandler(router, "/ask-eco", "head");

  const req = new MockRequest({}, { origin: "https://ecofrontend888.vercel.app" });
  req.method = "HEAD";

  const res = new MockResponse();

  await handler(req as any, res as any);

  assert.equal(res.statusCode, 200, "HEAD should respond 200");
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "https://ecofrontend888.vercel.app",
    "should echo allowed origin",
  );
  const allowMethods = res.headers.get("access-control-allow-methods");
  assert.equal(
    allowMethods,
    "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "should include HEAD in allowed methods",
  );
  assert.equal(res.ended, true, "response should end");
});
