import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import Module from "module";
import type { Request, Response } from "express";
import { clearResponseCache, RESPONSE_CACHE } from "../server/services/CacheService";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-role-key";

const mixpanelModule = {
  init() {
    return {
      track() {},
      register() {},
      register_once() {},
      people: {
        set() {},
        set_once() {},
        increment() {},
      },
    };
  },
};

const originalLoad = (Module as any)._load;
(Module as any)._load = function patchedLoad(
  request: string,
  parent: NodeModule,
  isMain: boolean
) {
  if (request === "mixpanel") {
    return mixpanelModule;
  }
  if (request === "dotenv") {
    return { config: () => ({}) };
  }
  if (request === "../adapters/EmbeddingAdapter") {
    return { getEmbeddingCached: async () => [] };
  }
  return originalLoad.call(this, request, parent, isMain);
};

type TestCase = { name: string; run: () => Promise<void> | void };

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

class MockRequest extends EventEmitter {
  body: any;
  headers: Record<string, string>;
  method = "POST";

  constructor(body: any, headers: Record<string, string>) {
    super();
    this.body = body;
    this.headers = headers;
  }
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  jsonPayload: any = null;

  status(this: this, code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }

  end() {
    this.emit("finish");
  }

  flush() {}

  flushHeaders() {}

  json(payload: unknown) {
    this.jsonPayload = payload;
    return this;
  }
}

test("cache hit rewrites legacy payload before streaming", async () => {
  clearResponseCache();
  const userId = "user-123";
  const ultimaMsg = "Oi, tudo bem?";
  const cacheKey = `resp:user:${userId}:${crypto
    .createHash("sha1")
    .update(`${userId}:${ultimaMsg}`)
    .digest("hex")}`;

  const legacyPayload = {
    raw: "Resposta curtinha",
    meta: {
      resumo: "Resumo curto",
      emocao: "alegre",
      intensidade: 3,
      tags: ["saudacao"],
      categoria: "saudacao",
    },
  };

  RESPONSE_CACHE.set(cacheKey, JSON.stringify(legacyPayload), 60_000);

  const [{ default: router }, { supabase }] = await Promise.all([
    import("../server/routes/openrouterRoutes"),
    import("../server/lib/supabaseAdmin"),
  ]);

  (supabase.auth.getUser as any) = async () => ({
    data: { user: { id: userId } },
    error: null,
  });

  const req = new MockRequest(
    {
      usuario_id: userId,
      mensagens: [{ role: "user", content: ultimaMsg }],
    },
    {
      authorization: "Bearer token",
    }
  );

  const res = new MockResponse();

  const askEcoLayer = (router as any).stack.find(
    (layer: any) => layer?.route?.path === "/ask-eco"
  );
  assert.ok(askEcoLayer, "ask-eco route not found");
  const handler = askEcoLayer.route.stack.find((layer: any) => layer.method === "post")
    ?.handle;
  assert.equal(typeof handler, "function", "handler should be a function");

  await handler!(req as unknown as Request, res as unknown as Response);

  const ssePayloads = res.chunks
    .map((chunk) => chunk.toString())
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.replace(/^data: /, "").trim())
    .map((line) => JSON.parse(line));

  const chunkPayload = ssePayloads.find((payload) => payload.type === "chunk");
  assert.ok(chunkPayload, "chunk payload should exist");
  const delta = String((chunkPayload as any).delta);
  const match = delta.match(/```json\s*([\s\S]+?)```/);
  assert.ok(match, "chunk delta should contain a json code block");
  assert.doesNotThrow(() => JSON.parse(match![1].trim()));

  const recachedRaw = RESPONSE_CACHE.get(cacheKey);
  assert.ok(recachedRaw, "cache entry should persist");
  const recachedPayload = JSON.parse(recachedRaw!);
  assert.match(recachedPayload.raw, /```json/);
  assert.equal(recachedPayload.meta.length, recachedPayload.raw.length);

  clearResponseCache();
});

(async () => {
  let failures = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      console.log(`✓ ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    console.error(`${failures} test(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`All ${tests.length} test(s) passed.`);
  }
})();
