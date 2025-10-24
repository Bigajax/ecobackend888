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

  const searchStack = (stack: any[], prefixes: RegExp[]): any => {
    for (const entry of stack) {
      const nextPrefixes = entry.regexp instanceof RegExp ? [...prefixes, entry.regexp] : prefixes;

      const matchesRoute = () => {
        if (!entry.route || !entry.route.methods?.[normalizedMethod]) {
          return false;
        }
        if (entry.route.path === path) {
          return prefixes.every((rx) => rx.test(path));
        }
        if (entry.route.path === "/") {
          return prefixes.length > 0 && prefixes.every((rx) => rx.test(path));
        }
        return false;
      };

      if (matchesRoute()) {
        const match = entry.route.stack.find(
          (stackEntry: any) => stackEntry.method === normalizedMethod
        )?.handle;
        if (!match) {
          throw new Error(`Handler for route ${path} not found`);
        }
        return match;
      }

      if (entry.handle?.stack) {
        const nested = searchStack(entry.handle.stack, nextPrefixes);
        if (nested) return nested;
      }
    }
    return null;
  };

  const handler = searchStack(router.stack, []);
  if (!handler) {
    throw new Error(`Route ${path} not found`);
  }
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
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.equal(res.headers.get("content-encoding"), "identity");
  assert.equal(res.headers.get("x-no-compression"), "1");
  assert.equal(res.headers.get("cache-control"), "no-cache");
  assert.equal(res.headers.get("connection"), "keep-alive");
  assert.equal(
    res.headers.get("x-eco-interaction-id"),
    TEST_INTERACTION_ID,
    "should expose interaction id in headers"
  );
  assert.equal(res.ended, true, "stream should close after done event");
  assert.ok(res.flushed, "safeWrite should flush chunks for SSE");

  const output = res.chunks.join("");
  assert.ok(res.chunks.length > 0, "should emit at least one SSE chunk");
  const events = output
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: ")) ?? "";
      const dataLine = lines.find((line) => line.startsWith("data: ")) ?? "";
      const event = eventLine.replace("event: ", "");
      const rawData = dataLine.replace("data: ", "");
      const data = rawData ? JSON.parse(rawData) : null;
      return { event, data };
    });

  assert.deepEqual(events[0], {
    event: "control",
    data: { name: "prompt_ready", interaction_id: TEST_INTERACTION_ID },
  });
  assert.ok(!output.includes("event: ping"), "should no longer emit ping events");
  assert.ok(!output.includes(":keepalive"), "heartbeat comment should omit legacy keepalive tag");
  const chunkEvents = events.filter((evt) => evt.event === "chunk");
  assert.equal(chunkEvents.length, 2, "should emit streamed chunk events");
  assert.deepEqual(
    chunkEvents[0].data,
    { index: 0, delta: "primeiro" },
    "first chunk should include index 0 and text"
  );
  assert.deepEqual(
    chunkEvents[1].data,
    { index: 1, delta: "segundo" },
    "second chunk should include index 1 and text"
  );
  assert.ok(!output.includes("__prompt_ready__"), "should not emit synthetic prompt_ready token");
  const controlEvents = events.filter((evt) => evt.event === "control");
  assert.deepEqual(
    controlEvents[controlEvents.length - 1],
    { event: "control", data: { name: "done" } },
    "stream should finalize with control:done"
  );
  const otherEvents = events.filter((evt) => !["control", "chunk"].includes(evt.event));
  assert.equal(otherEvents.length, 0, "should not emit auxiliary SSE event types");
  assert.ok(!output.includes("data: ok"), "should avoid plain ok payloads");
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
    assert.match(
      output,
      new RegExp(STREAM_TIMEOUT_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "fallback chunk should contain timeout message"
    );

    const events = output
      .split("\n\n")
      .filter(Boolean)
      .map((chunk) => {
        const lines = chunk.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event: ")) ?? "";
        const dataLine = lines.find((line) => line.startsWith("data: ")) ?? "";
        const event = eventLine.replace("event: ", "");
        const rawData = dataLine.replace("data: ", "");
        const data = rawData ? JSON.parse(rawData) : null;
        return { event, data };
      });

    assert.deepEqual(
      events[0],
      {
        event: "control",
        data: { name: "prompt_ready", interaction_id: TEST_INTERACTION_ID },
      },
      "should announce prompt_ready before timeout fallback"
    );

    const timeoutChunk = events.find((evt) => evt.event === "chunk");
    assert.ok(timeoutChunk, "fallback should emit chunk event");
    assert.deepEqual(
      timeoutChunk?.data,
      { index: 0, delta: STREAM_TIMEOUT_MESSAGE },
      "fallback chunk should use minimal schema"
    );

    const finalControl = events[events.length - 1];
    assert.deepEqual(
      finalControl,
      { event: "control", data: { name: "done" } },
      "fallback should finish with control:done"
    );

    const otherEvents = events.filter((evt) => !["control", "chunk"].includes(evt.event));
    assert.equal(otherEvents.length, 0, "fallback should avoid auxiliary SSE events");
    assert.ok(!output.includes("data: ok"), "fallback stream should avoid ok payloads");
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

    const chunksBeforeEnd = res.chunks.length;
    session.end();
    assert.equal(
      res.chunks.length,
      chunksBeforeEnd,
      "StreamSession end should not append extra SSE frames"
    );
    assert.ok(
      !res.chunks.some((chunk) => chunk.includes("data: ok")),
      "StreamSession should avoid sending ok payloads on end"
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

test("client message ids are deduped with 409 without re-running orchestrator", async () => {
  let orchestratorCalls = 0;
  let interactionCreates = 0;
  const router = await loadRouterWithStubs("../../routes/promptRoutes", {
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        orchestratorCalls += 1;
        if (params.stream?.onEvent) {
          params.stream.onEvent({ type: "chunk", delta: `resposta-${orchestratorCalls}` });
          params.stream.onEvent({
            type: "done",
            meta: { finishReason: "stop" },
          });
        }
        return { raw: `resposta-${orchestratorCalls}` };
      },
    },
    "../services/conversation/interactionAnalytics": {
      createInteraction: async () => {
        interactionCreates += 1;
        return TEST_INTERACTION_ID;
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

  const buildRequest = () => {
    const req = new MockRequest(
      {
        stream: true,
        clientMessageId: "client-123",
        messages: [{ role: "user", content: "Olá" }],
      },
      {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
    );
    req.guest = { id: TEST_GUEST_ID };
    req.guestId = TEST_GUEST_ID;
    return req;
  };

  const firstRes = new MockResponse();
  await handler(buildRequest() as any, firstRes as any);

  assert.equal(firstRes.statusCode, 200, "first stream should succeed");
  assert.equal(orchestratorCalls, 1, "orchestrator should be called once for first run");
  assert.equal(interactionCreates, 1, "interaction row should be created once");

  const secondRes = new MockResponse();
  await handler(buildRequest() as any, secondRes as any);

  assert.equal(secondRes.statusCode, 409, "duplicate client message should be rejected");
  assert.equal(orchestratorCalls, 1, "duplicate should not reach orchestrator again");
  assert.equal(interactionCreates, 1, "duplicate should not insert another interaction");
  assert.ok(secondRes.chunks.length > 0, "duplicate response should include JSON body");
  const duplicatePayload = JSON.parse(secondRes.chunks[0]);
  assert.equal(duplicatePayload.code, "DUPLICATE_CLIENT_MESSAGE");
});

test("starting a new stream on the same stream id aborts the previous run", async () => {
  const infoCalls: Array<unknown[]> = [];
  let firstAbortReason: unknown = null;
  let callCount = 0;

  const logStub = {
    info: (...args: unknown[]) => {
      infoCalls.push(args);
    },
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    withContext: () => logStub,
  } as const;

  const router = await loadRouterWithStubs("../../routes/promptRoutes", {
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        callCount += 1;
        if (callCount === 1) {
          if (params.abortSignal) {
            params.abortSignal.addEventListener(
              "abort",
              () => {
                firstAbortReason = params.abortSignal?.reason;
              },
              { once: true },
            );
          }
          return await new Promise((_, reject) => {
            params.abortSignal?.addEventListener(
              "abort",
              () => reject(new Error("aborted by test")),
              { once: true },
            );
          });
        }

        if (params.stream?.onEvent) {
          params.stream.onEvent({ type: "chunk", delta: "segunda" });
          params.stream.onEvent({ type: "done", meta: { finishReason: "stop" } });
        }
        return { raw: "segunda" };
      },
    },
    "../services/conversation/interactionAnalytics": {
      createInteraction: async () => TEST_INTERACTION_ID,
    },
    "../services/promptContext/logger": {
      log: logStub,
    },
  });

  const handler = getRouteHandler(router, "/ask-eco");

  const makeRequest = () => {
    const req = new MockRequest(
      {
        stream: true,
        messages: [{ role: "user", content: "Olá" }],
      },
      {
        accept: "text/event-stream",
        "content-type": "application/json",
        "x-stream-id": "stream-abc",
      },
    );
    req.guest = { id: TEST_GUEST_ID };
    req.guestId = TEST_GUEST_ID;
    return req;
  };

  const firstRes = new MockResponse();
  const firstPromise = handler(makeRequest() as any, firstRes as any);

  await new Promise((resolve) => setImmediate(resolve));

  const secondRes = new MockResponse();
  await handler(makeRequest() as any, secondRes as any);
  await firstPromise;

  assert.equal(secondRes.statusCode, 200, "new stream should succeed");
  assert.ok(infoCalls.some((entry) => entry[0] === "[ask-eco] sse_stream_replaced"));
  assert.equal(firstRes.ended, true, "previous response should end after abort");
  assert.equal(
    firstRes.chunks[firstRes.chunks.length - 1],
    'event: control\ndata: {"name":"done"}\n\n'
  );
  assert.ok(firstAbortReason instanceof Error || typeof firstAbortReason === "string");
});

test("three sequential streams emit independent chunk sequences", async () => {
  const texts = ["resposta A", "resposta B", "resposta C"];
  let callIndex = 0;
  const createdInteractions: string[] = [];

  const router = await loadRouterWithStubs("../../routes/promptRoutes", {
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        const current = callIndex;
        callIndex += 1;
        if (params.stream?.onEvent) {
          params.stream.onEvent({ type: "chunk", delta: texts[current] });
          params.stream.onEvent({ type: "done", meta: { finishReason: "stop" } });
        }
        return { raw: texts[current] };
      },
    },
    "../services/conversation/interactionAnalytics": {
      createInteraction: async () => {
        const id = `${TEST_INTERACTION_ID}-${createdInteractions.length}`;
        createdInteractions.push(id);
        return id;
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

  for (let i = 0; i < texts.length; i += 1) {
    const req = new MockRequest(
      {
        stream: true,
        clientMessageId: `client-${i}`,
        messages: [{ role: "user", content: `Olá ${i}` }],
      },
      {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
    );
    req.guest = { id: TEST_GUEST_ID };
    req.guestId = TEST_GUEST_ID;

    const res = new MockResponse();
    await handler(req as any, res as any);

    const output = res.chunks.join("");
    const events = output
      .split("\n\n")
      .filter(Boolean)
      .map((chunk) => {
        const lines = chunk.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event: ")) ?? "";
        const dataLine = lines.find((line) => line.startsWith("data: ")) ?? "";
        const event = eventLine.replace("event: ", "");
        const rawData = dataLine.replace("data: ", "");
        const data = rawData ? JSON.parse(rawData) : null;
        return { event, data };
      });

    assert.deepEqual(
      events[0],
      {
        event: "control",
        data: {
          name: "prompt_ready",
          interaction_id: createdInteractions[i],
        },
      },
      "stream should announce prompt_ready before chunks",
    );

    const chunkEvent = events.find((evt) => evt.event === "chunk");
    assert.ok(chunkEvent, "stream should emit chunk event");
    assert.deepEqual(
      chunkEvent?.data,
      { index: 0, delta: texts[i] },
      "chunk event should include index and text without interaction metadata",
    );

    const finalEvent = events[events.length - 1];
    assert.deepEqual(finalEvent, { event: "control", data: { name: "done" } });

    const otherEvents = events.filter((evt) => !["control", "chunk"].includes(evt.event));
    assert.equal(otherEvents.length, 0, "stream should not emit auxiliary SSE events");
    assert.ok(!output.includes("data: ok"), "stream should avoid ok payloads");
  }

  assert.equal(createdInteractions.length, texts.length, "should create one interaction per message");
  assert.equal(callIndex, texts.length, "orchestrator should run for each message");
});
