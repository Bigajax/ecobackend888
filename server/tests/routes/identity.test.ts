import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import Module from "node:module";
import { createApp as createHttpApp } from "../../core/http/app";

type StubMap = Record<string, unknown>;

type LoggerEntry = { level: string; args: unknown[] };

const createLoggerStub = () => {
  const entries: LoggerEntry[] = [];
  const factory = (level: string) =>
    (...args: unknown[]) => {
      entries.push({ level, args });
    };
  return {
    entries,
    info: factory("info"),
    warn: factory("warn"),
    error: factory("error"),
    debug: factory("debug"),
    reset() {
      entries.splice(0, entries.length);
    },
  };
};

const withPatchedModules = async <T>(stubs: StubMap, loader: () => Promise<T> | T) => {
  const moduleAny = Module as any;
  const originalLoad = moduleAny._load;
  moduleAny._load = function patched(request: string, parent: any, isMain: boolean) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return await loader();
  } finally {
    moduleAny._load = originalLoad;
  }
};

const loadAskEcoRouter = async () => {
  const logger = createLoggerStub();
  let validationCall = 0;

  const validateAskEcoPayload = () => {
    validationCall += 1;
    const suffix = (1000 + validationCall).toString().padStart(12, "0");
    return {
      valid: true,
      data: {
        body: {
          nome_usuario: undefined,
          usuario_id: undefined,
          clientHour: undefined,
          isGuest: true,
          guestId: undefined,
          sessionMeta: undefined,
        },
        normalized: {
          messages: [{ role: "user", content: "olá" }],
        },
        payloadShape: "basic",
        clientMessageId: undefined,
        activeClientMessageId: `11111111-1111-4111-8111-${suffix}`,
        sessionMetaObject: null,
      },
    };
  };

  const stubs: StubMap = {
    "../controllers/promptController": {
      getPromptEcoPreview: async (_req: express.Request, res: express.Response) =>
        res.status(200).end(),
    },
    "../services/ConversationOrchestrator": {
      getEcoResponse: async () => ({
        usage: { prompt_tokens: 1, completion_tokens: 2 },
        meta: { interaction_id: "interaction-stub" },
        timings: { total: 5 },
      }),
    },
    "../services/promptContext/logger": { log: logger },
    "../utils/http": {
      createHttpError: (status: number, code: string, message: string) => {
        const error = new Error(message) as Error & { status: number; body: any };
        error.status = status;
        error.body = { code, message };
        return error;
      },
      isHttpError: (value: unknown): value is { status: number; body: any } => {
        return Boolean(value && typeof value === "object" && "status" in value && "body" in value);
      },
    },
    "../lib/supabaseAdmin": {
      getSupabaseAdmin: () => ({
        auth: { admin: { listUsers: async () => ({ data: null }) } },
      }),
    },
    "../utils/sse": {
      createSSE: () => ({
        send: () => {},
        end: () => {},
        flush: () => {},
        close: () => {},
        sendComment: () => {},
      }),
      prepareSse: () => {},
    },
    "../utils/streamJoin": { smartJoin: (parts: string[]) => parts.join("") },
    "../services/conversation/interactionIdentityStore": {
      rememberInteractionGuest: () => {},
      updateInteractionGuest: () => {},
    },
    "../middleware/cors": {
      corsMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
        next(),
      resolveCorsOrigin: () => null,
    },
    "../services/conversation/interactionAnalytics": {
      createInteraction: async () => "interaction-stub",
    },
    "../utils/textExtractor": {
      extractEventText: () => "",
      extractTextLoose: () => "resposta",
      sanitizeOutput: (text: string) => text,
    },
    "../utils/guestIdResolver": {
      getGuestIdFromCookies: () => null,
      resolveGuestId: (...candidates: (string | undefined)[]) => {
        for (const candidate of candidates) {
          if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
          }
        }
        return null;
      },
    },
    "../validation/payloadValidator": {
      validateAskEcoPayload,
    },
    "../sse/sseState": {
      SseStreamState: class {
        done = false;
        promptReadyAt = 0;
        closeAt = 0;
        chunksCount = 0;
        bytesCount = 0;
        clientClosedStack: string | null = null;
        closeErrorMessage: string | null = null;
        firstTokenWatchdogFired = false;
        sawChunk = false;
        clientClosed = false;
        usageTokens = { in: 0, out: 0 };
        doneMeta: Record<string, unknown> | null = null;
        finishReason: string | null = null;
        serverAbortReason: string | null = null;
        classifyClose = () => "unknown" as const;
        markConnectionClosed = () => "unknown" as const;
        clearFirstTokenWatchdogTimer = () => {};
        markFirstTokenWatchdogCleared = () => {};
        markFirstTokenWatchdogFired = () => {
          this.firstTokenWatchdogFired = true;
        };
        ensureFinishReason = (_reason: string) => {};
        updateLastEvent = () => {};
        setFirstTokenWatchdogTimer = () => {};
        markFirstTokenWatchdogTimer = () => {};
        setFinishReason = (reason: string) => {
          this.finishReason = reason;
        };
        setDoneMeta = (meta: Record<string, unknown>) => {
          this.doneMeta = meta;
        };
        setPromptReadyAt = (value: number) => {
          this.promptReadyAt = value;
        };
        setCloseAt = (value: number) => {
          this.closeAt = value;
        };
        markPromptReady = () => {};
        markChunkSeen = (_delta: string, size: number) => {
          this.sawChunk = true;
          this.chunksCount += 1;
          this.bytesCount += size;
        };
        updateUsageTokens = (meta: any) => {
          this.usageTokens = meta ?? { in: 0, out: 0 };
        };
        mergeLatencyMarks = () => {};
        setServerAbortReason = (reason: string | null) => {
          this.serverAbortReason = reason ?? null;
        };
        ensureFinishReasonFromDone = () => {};
        markClientClosed = () => {
          this.clientClosed = true;
        };
      },
    },
    "../sse/sseEvents": {
      SseEventHandlers: class {
        constructor() {}
      },
    },
    "../sse/sseTelemetry": {
      SseTelemetry: class {
        constructor() {}
        record = () => {};
      },
    },
    "../deduplication/activeStreamManager": {
      activeStreamSessions: new Map<string, { controller: AbortController; interactionId: string }>(),
      buildActiveInteractionKey: (scope: string, key: string) => `${scope}:${key}`,
      releaseActiveInteraction: () => {},
      reserveActiveInteraction: () => true,
    },
    "../deduplication/clientMessageRegistry": {
      buildClientMessageKey: (identity: string | null, id: string) => `${identity ?? "anon"}:${id}`,
      markClientMessageCompleted: () => {},
      releaseClientMessage: () => {},
      reserveClientMessage: () => ({ ok: true, status: "ok" }),
    },
  } satisfies StubMap;

  const router = await withPatchedModules(stubs, () => {
    const modulePath = require.resolve("../../routes/promptRoutes");
    delete require.cache[modulePath];
    const mod = require("../../routes/promptRoutes");
    return mod.askEcoRoutes as express.Router;
  });

  return { router, logger };
};

const routerPromise = loadAskEcoRouter();

const createApp = async () => {
  const { router, logger } = await routerPromise;
  logger.reset();
  const app = express();
  app.use(express.json());
  app.use("/api/ask-eco", router);
  return { app, logger };
};

const uuidGuest = "11111111-1111-4111-8111-111111111111";
const uuidSession = "22222222-2222-4222-8222-222222222222";

test("POST /api/ask-eco aceita IDs por query", async () => {
  const { app, logger } = await createApp();

  const response = await request(app)
    .post("/api/ask-eco")
    .query({ guest_id: uuidGuest, session_id: uuidSession })
    .send({ messages: [{ role: "user", content: "olá" }] });

  assert.equal(response.status, 200);
  assert.equal(response.headers["x-eco-guest-id"], uuidGuest);
  assert.equal(response.headers["x-eco-session-id"], uuidSession);
  assert.equal(typeof response.body, "object");
  assert.equal(response.body.interaction_id, "interaction-stub");

  const payloadLog = logger.entries.find(
    (entry) => entry.level === "info" && entry.args[0] === "[ask-eco] payload_valid"
  );
  assert.ok(payloadLog, "esperava log payload_valid");
  assert.deepEqual(payloadLog?.args[1], { guestId: uuidGuest, sessionId: uuidSession });
});

test("POST /api/ask-eco aceita IDs por headers", async () => {
  const { app, logger } = await createApp();

  const response = await request(app)
    .post("/api/ask-eco")
    .set("X-Eco-Guest-Id", uuidGuest)
    .set("X-Eco-Session-Id", uuidSession)
    .send({ messages: [{ role: "user", content: "olá" }] });

  assert.equal(response.status, 200);
  assert.equal(response.headers["x-eco-guest-id"], uuidGuest);
  assert.equal(response.headers["x-eco-session-id"], uuidSession);

  const payloadLog = logger.entries.find(
    (entry) => entry.level === "info" && entry.args[0] === "[ask-eco] payload_valid"
  );
  assert.ok(payloadLog, "esperava log payload_valid");
  assert.deepEqual(payloadLog?.args[1], { guestId: uuidGuest, sessionId: uuidSession });
});

test("HEAD /api/ask-eco responde 204 com CORS básico", async () => {
  const app = createHttpApp();

  const response = await request(app)
    .head("/api/ask-eco")
    .set("Origin", "https://ecofrontend888.vercel.app");

  assert.equal(response.status, 204);
  assert.equal(response.text, "");
  assert.equal(
    response.headers["access-control-allow-origin"],
    "https://ecofrontend888.vercel.app",
  );
  assert.equal(response.headers["access-control-allow-methods"], "GET,POST,OPTIONS,HEAD");
  assert.equal(response.headers["access-control-allow-headers"], "Content-Type, Accept");
  assert.equal(response.headers["access-control-max-age"], "86400");
  const varyHeader = response.headers["vary"];
  assert.ok(typeof varyHeader === "string" && varyHeader.includes("Origin"));
});

