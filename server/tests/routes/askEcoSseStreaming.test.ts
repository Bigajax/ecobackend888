import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { StreamSession, HEARTBEAT_INTERVAL_MS } from "../../routes/askEco/streaming";

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

type ContractEvent =
  | { kind: "chunk"; payload: { index: number; text: string } }
  | { kind: "done"; payload: { index: number; done: true } };

const parseSsePayloads = (raw: string): Array<Record<string, any>> => {
  return raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s*/, ""))
        .join("");
      if (!data) {
        return null;
      }
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    })
    .filter((payload): payload is Record<string, any> => payload !== null)
    .filter((payload) => payload.type !== "ping");
};

const toContractEvents = (raw: string): ContractEvent[] => {
  return parseSsePayloads(raw).map((payload) => {
    if (payload && typeof payload === "object" && payload.done === true) {
      return {
        kind: "done",
        payload: { index: Number(payload.index ?? 0), done: true },
      } satisfies ContractEvent;
    }
    return {
      kind: "chunk",
      payload: {
        index: Number(payload.index ?? 0),
        text: String(payload.text ?? ""),
      },
    } satisfies ContractEvent;
  });
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
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(res.headers.get("content-encoding"), "identity");
  assert.equal(res.headers.get("x-no-compression"), "1");
  assert.equal(res.headers.get("cache-control"), "no-cache, no-transform");
  assert.equal(res.headers.get("connection"), "keep-alive");
  assert.equal(
    res.headers.get("x-eco-interaction-id"),
    TEST_INTERACTION_ID,
    "should expose interaction id in headers"
  );
  assert.ok(res.headersFlushed, "should flush headers immediately for SSE");
  assert.equal(res.ended, true, "stream should close after done event");
  assert.ok(res.flushed, "safeWrite should flush chunks for SSE");
  assert.equal(res.chunks[0], ": open\n\n", "should send initial open comment before data");

  const output = res.chunks.join("");
  assert.ok(res.chunks.length > 0, "should emit at least one SSE chunk");
  const payloads = parseSsePayloads(output);
  assert.ok(payloads.length >= 2, "should emit chunks and a done payload");

  const promptReadyPayload = payloads.find((payload) => payload?.name === "prompt_ready");
  assert.ok(promptReadyPayload, "should emit prompt_ready control event");
  const nonControlPayloads = payloads.filter((payload) => payload?.name !== "prompt_ready");
  for (const payload of nonControlPayloads) {
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "type"));
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "delta"));
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "name"));
  }

  const contractEvents = toContractEvents(output);
  const chunkEvents = contractEvents.filter((evt) => evt.kind === "chunk");
  assert.equal(chunkEvents.length, 2, "should emit streamed chunk events");
  assert.deepEqual(
    chunkEvents[0].payload,
    { index: 0, text: "primeiro" },
    "first chunk should include index 0 and text"
  );
  assert.deepEqual(
    chunkEvents[1].payload,
    { index: 1, text: "segundo" },
    "second chunk should include index 1 and text"
  );

  const doneEvent = contractEvents.find((evt) => evt.kind === "done");
  assert.ok(doneEvent, "should emit final done payload");
  assert.equal(doneEvent!.payload.index, chunkEvents.length, "done index should match chunk count");
  assert.equal(doneEvent!.payload.done, true);

  assert.ok(
    !payloads.some((entry) => typeof entry.text === "string" && entry.text.trim().toLowerCase() === "ok"),
    "should avoid plain ok payloads"
  );
});

test("SSE streaming sends open comment and heartbeats before first chunk", async () => {
  let heartbeatCallback: (() => void) | null = null;
  const fakeInterval = { ref: Symbol("interval") } as unknown as NodeJS.Timeout;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;

  try {
    (global as any).setInterval = ((fn: () => void) => {
      heartbeatCallback = fn;
      return fakeInterval;
    }) as typeof setInterval;
    (global as any).clearInterval = () => {};

    let releaseResponse: (() => void) | null = null;

    const router = await loadRouterWithStubs("../../routes/promptRoutes", {
      "../services/ConversationOrchestrator": {
        getEcoResponse: async () =>
          await new Promise((resolve) => {
            releaseResponse = () => resolve({ raw: "resultado" });
          }),
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

    const handlerPromise = handler(req as any, res as any);

    assert.equal(res.chunks[0], ": open\n\n", "should send open comment immediately");
    assert.ok(heartbeatCallback, "should register heartbeat callback");

    heartbeatCallback?.();

    assert.ok(
      res.chunks.some((chunk, index) => index > 0 && chunk.includes(": hb")),
      "heartbeat callback should append hb comment"
    );

    releaseResponse?.();
    await handlerPromise;
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
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

    assert.ok(!output.includes("event:"), "should not include explicit event fields");

    const payloads = parseSsePayloads(output);
    const contractEvents = toContractEvents(output);
    const chunkEvents = contractEvents.filter((evt) => evt.kind === "chunk");
    assert.ok(chunkEvents.length >= 1, "idle timeout guard should emit at least one chunk");
    assert.ok(
      chunkEvents.every((evt) => typeof evt.payload.text === "string" && evt.payload.text.length > 0),
      "chunks should include non-empty text",
    );

    const doneEvent = contractEvents.find((evt) => evt.kind === "done");
    assert.ok(doneEvent, "stream should end with done payload");
    assert.equal(doneEvent!.payload.index, chunkEvents.length);
    assert.equal(doneEvent!.payload.done, true);

    const nonControlPayloads = payloads.filter((payload) => payload.name !== "prompt_ready");
    for (const payload of nonControlPayloads) {
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, "type"));
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, "delta"));
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, "name"));
    }

  } finally {
    if (previousTimeout === undefined) {
      delete process.env.ECO_SSE_TIMEOUT_MS;
    } else {
      process.env.ECO_SSE_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("StreamSession heartbeats send JSON ping payloads frequently", async () => {
  assert.equal(HEARTBEAT_INTERVAL_MS, 2_000, "heartbeat interval should be two seconds");

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
      res.chunks.some((chunk) => chunk.includes('"type":"ping"')),
      "heartbeat callback should write JSON ping payload"
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
  const firstOutput = firstRes.chunks.join("");
  const firstEvents = toContractEvents(firstOutput);
  const lastEvent = firstEvents[firstEvents.length - 1];
  assert.ok(lastEvent?.kind === "done", "aborted stream should finish with done payload");
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
    assert.ok(!output.includes("event:"), "should not include explicit event fields");

    const payloads = parseSsePayloads(output);
    const contractEvents = toContractEvents(output);
    const chunkEvents = contractEvents.filter((evt) => evt.kind === "chunk");
    assert.equal(chunkEvents.length, 1, "stream should emit exactly one chunk event");
    const chunkEvent = chunkEvents[0];
    assert.deepEqual(
      chunkEvent?.payload,
      { index: 0, text: texts[i] },
      "chunk event should include index and text without interaction metadata",
    );

    const doneEvent = contractEvents.find((evt) => evt.kind === "done");
    assert.ok(doneEvent, "stream should end with done payload");
    assert.equal(doneEvent!.payload.index, chunkEvents.length);
    assert.equal(doneEvent!.payload.done, true);

    for (const payload of payloads) {
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, "type"));
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, "delta"));
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, "name"));
    }

    assert.ok(!payloads.some((entry) => typeof entry.text === "string" && entry.text.trim().toLowerCase() === "ok"));
  }

  assert.equal(createdInteractions.length, texts.length, "should create one interaction per message");
  assert.equal(callIndex, texts.length, "orchestrator should run for each message");
});

test("SSE bootstrap forwards Last-Event-ID to interaction creation", async () => {
  const lastEventId = "evt-last-42";
  let recordedMessageId: string | undefined;

  const router = await loadRouterWithStubs("../../routes/promptRoutes", {
    "../services/ConversationOrchestrator": {
      getEcoResponse: async (params: any) => {
        params.stream?.onEvent?.({ type: "chunk", delta: "olá" });
        params.stream?.onEvent?.({ type: "done", meta: { finishReason: "stop" } });
        return { raw: "olá" };
      },
    },
    "../services/conversation/interactionAnalytics": {
      createInteraction: async (payload: { messageId?: string | null }) => {
        recordedMessageId = payload.messageId ?? undefined;
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

  const req = new MockRequest(
    {
      stream: true,
      messages: [{ role: "user", content: "Olá" }],
    },
    {
      accept: "text/event-stream",
      origin: "http://localhost:5173",
      "content-type": "application/json",
      "last-event-id": lastEventId,
    },
  );
  req.guest = { id: TEST_GUEST_ID };
  req.guestId = TEST_GUEST_ID;

  const res = new MockResponse();
  await handler(req as any, res as any);

  assert.equal(recordedMessageId, lastEventId);
  assert.equal(res.statusCode, 200);
});
