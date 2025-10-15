import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { STREAM_TIMEOUT_MESSAGE } from "../../routes/askEco/streaming";

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

const getRouteHandler = (router: any, path: string) => {
  const layer = router.stack.find((entry: any) => entry.route?.path === path);
  if (!layer) throw new Error(`Route ${path} not found`);
  const handler = layer.route.stack[0]?.handle;
  if (!handler) throw new Error(`Handler for route ${path} not found`);
  return handler;
};

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
    this.body = body;
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
  req.guest = { id: "guest-123" };
  req.guestId = "guest-123";

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
  const pingCount = (output.match(/event: ping/g) ?? []).length;
  assert.ok(pingCount >= 1, "should emit at least one ping event");
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
  req.guest = { id: "guest-timeout" };
  req.guestId = "guest-timeout";

  const res = new MockResponse();

  try {
    await handler(req as any, res as any);

    const output = res.chunks.join("");
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
