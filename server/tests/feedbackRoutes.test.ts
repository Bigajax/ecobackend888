import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

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

const loadRouterWithStubs = async (stubs: StubMap) => {
  return withPatchedModules(stubs, () => {
    const resolved = require.resolve("../routes/feedbackRoutes");
    delete require.cache[resolved];
    const mod = require("../routes/feedbackRoutes");
    return mod.default ?? mod;
  });
};

test("POST /api/feedback aceita payload válido e retorna 204", async () => {
  const insertFeedbackCalls: any[] = [];

  const router = await loadRouterWithStubs({
    "../services/supabase/analyticsClient": {
      insertFeedback: async (payload: unknown) => {
        insertFeedbackCalls.push(payload);
      },
      insertInteraction: async () => {},
      insertLatency: async () => {},
    },
  });

  const app = express();
  app.use(express.json());
  app.use("/api", router);

  const response = await request(app)
    .post("/api/feedback")
    .set("X-Guest-Id", "guest-123")
    .send({ interaction_id: "00000000-0000-0000-0000-000000000001", vote: "up" });

  assert.equal(response.status, 204);
  assert.equal(insertFeedbackCalls.length, 1);
  assert.deepEqual(insertFeedbackCalls[0], {
    interaction_id: "00000000-0000-0000-0000-000000000001",
    vote: "up",
    user_id: null,
    session_id: null,
  });
});

test("POST /api/interaction responde 201 com id do payload", async () => {
  const insertInteractionCalls: any[] = [];

  const router = await loadRouterWithStubs({
    "../services/supabase/analyticsClient": {
      insertFeedback: async () => {},
      insertInteraction: async (payload: unknown) => {
        insertInteractionCalls.push(payload);
      },
      insertLatency: async () => {},
    },
  });

  const app = express();
  app.use(express.json());
  app.use("/api", router);

  const response = await request(app)
    .post("/api/interaction")
    .send({
      interaction_id: "00000000-0000-0000-0000-000000000002",
      user_id: "00000000-0000-0000-0000-000000000010",
      module_combo: ["IDENTIDADE"],
    });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { id: "00000000-0000-0000-0000-000000000002" });
  assert.equal(insertInteractionCalls.length, 1);
  assert.deepEqual(insertInteractionCalls[0], {
    interaction_id: "00000000-0000-0000-0000-000000000002",
    user_id: "00000000-0000-0000-0000-000000000010",
    session_id: null,
    module_combo: ["IDENTIDADE"],
  });
});

test("POST /api/latency retorna 204", async () => {
  const insertLatencyCalls: any[] = [];

  const router = await loadRouterWithStubs({
    "../services/supabase/analyticsClient": {
      insertFeedback: async () => {},
      insertInteraction: async () => {},
      insertLatency: async (payload: unknown) => {
        insertLatencyCalls.push(payload);
      },
    },
  });

  const app = express();
  app.use(express.json());
  app.use("/api", router);

  const response = await request(app)
    .post("/api/latency")
    .send({
      response_id: "00000000-0000-0000-0000-000000000099",
      ttfb_ms: 120,
      ttlc_ms: 450,
    });

  assert.equal(response.status, 204);
  assert.equal(insertLatencyCalls.length, 1);
  assert.deepEqual(insertLatencyCalls[0], {
    response_id: "00000000-0000-0000-0000-000000000099",
    ttfb_ms: 120,
    ttlc_ms: 450,
  });
});

test("POST /api/feedback retorna 502 se insert falhar", async () => {
  const router = await loadRouterWithStubs({
    "../services/supabase/analyticsClient": {
      insertFeedback: async () => {
        throw new Error("fail");
      },
      insertInteraction: async () => {},
      insertLatency: async () => {},
    },
  });

  const app = express();
  app.use(express.json());
  app.use("/api", router);

  const response = await request(app)
    .post("/api/feedback")
    .send({ interaction_id: "00000000-0000-0000-0000-000000000003", vote: "down" });

  assert.equal(response.status, 502);
  assert.equal(response.body.code, "SUPABASE_INSERT_FAILED");
});

test("POST /api/interaction retorna 400 se payload inválido", async () => {
  const router = await loadRouterWithStubs({
    "../services/supabase/analyticsClient": {
      insertFeedback: async () => {},
      insertInteraction: async () => {},
      insertLatency: async () => {},
    },
  });

  const app = express();
  app.use(express.json());
  app.use("/api", router);

  const response = await request(app).post("/api/interaction").send({});

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "INVALID_PAYLOAD");
});
