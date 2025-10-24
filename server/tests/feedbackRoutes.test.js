const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

require("ts-node").register({ transpileOnly: true });

const Module = require("node:module");

const withPatchedModules = async (stubs, loader) => {
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
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

const loadRouterWithStubs = async (stubs) => {
  return withPatchedModules(stubs, () => {
    const resolved = require.resolve("../routes/feedbackRoutes");
    const controller = require.resolve("../controllers/feedbackController");
    const supabase = require.resolve("../services/supabaseClient");
    delete require.cache[resolved];
    delete require.cache[controller];
    delete require.cache[supabase];
    const mod = require("../routes/feedbackRoutes");
    return mod.default ?? mod;
  });
};

class AnalyticsStub {
  constructor(config = {}) {
    this.config = config;
    this.moduleCalls = [];
    this.feedbackInserts = [];
    this.banditInserts = [];
    this.rpcCalls = [];
    this.interactionQueries = [];
  }

  from(table) {
    if (table === "eco_interactions") {
      const query = {
        select: () => query,
        eq: (_column, value) => {
          query.eqValue = value;
          this.interactionQueries.push({ table, value });
          return query;
        },
        maybeSingle: async () => {
          if (this.config.interactionError) {
            return { data: null, error: this.config.interactionError };
          }

          const interactions = this.config.interactions ?? [];
          const legacyRow = this.config.interactionRow ? [this.config.interactionRow] : [];
          const pool = interactions.length ? interactions : legacyRow;
          const row = pool.find((item) => !query.eqValue || item.id === query.eqValue) ?? null;
          return { data: row ?? null, error: null };
        },
      };

      return query;
    }

    if (table === "eco_module_usages") {
      const query = {
        select: () => query,
        eq: (_column, value) => {
          this.moduleCalls.push({ table, value });
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: this.config.moduleKey ? { module_key: this.config.moduleKey } : null,
          error: this.config.moduleError ?? null,
        }),
      };
      return query;
    }

    if (table === "eco_feedback") {
      return {
        insert: async (rows) => {
          this.feedbackInserts.push({ table, rows });
          return { data: null, error: this.config.feedbackError ?? null };
        },
      };
    }

    if (table === "bandit_rewards") {
      return {
        insert: (rows) => {
          this.banditInserts.push({ table, rows });
          return {
            select: async () => ({
              data: this.config.banditSelectRows ?? rows,
              error: this.config.banditError ?? null,
            }),
          };
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  }

  async rpc(name, params) {
    this.rpcCalls.push({ name, params });
    return { data: null, error: this.config.rpcError ?? null };
  }
}

test("POST /api/feedback infere braço e aplica recompensa", async () => {
  const interactionId = "00000000-0000-0000-0000-000000000111";
  const analytics = new AnalyticsStub({
    moduleKey: "arm-inferido",
    interactionRow: {
      id: interactionId,
      message_id: "mensagem-xyz",
      prompt_hash: "prompt-hash-123",
      user_id: "user-123",
      session_id: "session-456",
    },
  });

  const router = await loadRouterWithStubs({
    "../services/supabaseClient": { getAnalyticsClient: () => analytics },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/feedback", router);

  const response = await request(app).post("/api/feedback").send({ interaction_id: interactionId, vote: "up" });

  assert.equal(response.status, 204);
  assert.equal(response.text ?? "", "");
  assert.deepEqual(response.body ?? {}, {});
  assert.equal(analytics.feedbackInserts.length, 1);
  assert.equal(analytics.banditInserts.length, 1);
  assert.equal(analytics.rpcCalls.length, 1);

  const feedbackRow = analytics.feedbackInserts[0].rows[0];
  assert.equal(feedbackRow.interaction_id, interactionId);
  assert.equal(feedbackRow.message_id, "mensagem-xyz");
  assert.equal(feedbackRow.vote, "up");
  assert.equal(feedbackRow.reason, null);
  assert.equal(feedbackRow.arm, "arm-inferido");
  assert.equal(feedbackRow.pillar, "default");
  assert.equal(feedbackRow.prompt_hash, "prompt-hash-123");
  assert.equal(feedbackRow.user_id, "user-123");
  assert.equal(feedbackRow.session_id, "session-456");
  assert.equal(typeof feedbackRow.timestamp, "string");

  const insert = analytics.banditInserts[0];
  assert.deepEqual(insert.rows[0], {
    response_id: "mensagem-xyz",
    pilar: "default",
    arm: "arm-inferido",
    recompensa: 1,
  });

  assert.deepEqual(analytics.rpcCalls[0], {
    name: "update_bandit_arm",
    params: { arm_id: "arm-inferido", reward: 1, p_arm_key: "arm-inferido", p_reward: 1 },
  });
});

test("POST /api/feedback aceita dislike e aplica recompensa negativa", async () => {
  const interactionId = "00000000-0000-0000-0000-000000000222";
  const analytics = new AnalyticsStub({
    interactions: [
      {
        id: interactionId,
        message_id: interactionId,
        prompt_hash: null,
        user_id: null,
        session_id: null,
      },
    ],
  });

  const router = await loadRouterWithStubs({
    "../services/supabaseClient": { getAnalyticsClient: () => analytics },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/feedback", router);

  const response = await request(app)
    .post("/api/feedback")
    .send({ interaction_id: interactionId, vote: "dislike", arm: "arm-x", pillar: "geral" });

  assert.equal(response.status, 204);
  assert.equal(analytics.feedbackInserts.length, 1);
  assert.equal(analytics.banditInserts.length, 1);
  assert.equal(analytics.rpcCalls.length, 1);

  const insert = analytics.banditInserts[0];
  assert.deepEqual(insert.rows[0], {
    response_id: interactionId,
    pilar: "geral",
    arm: "arm-x",
    recompensa: -1,
  });
});

test("POST /api/feedback rejeita quando interaction_id ausente", async () => {
  const analytics = new AnalyticsStub();

  const router = await loadRouterWithStubs({
    "../services/supabaseClient": { getAnalyticsClient: () => analytics },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/feedback", router);

  const response = await request(app).post("/api/feedback").send({ vote: "up" });

  assert.equal(response.status, 400);
  assert.equal(response.body?.message, "missing_interaction_id");
  assert.equal(analytics.feedbackInserts.length, 0);
  assert.equal(analytics.banditInserts.length, 0);
  assert.equal(analytics.rpcCalls.length, 0);
});

test("POST /api/feedback retorna 404 quando interaction não existe", async () => {
  const interactionId = "00000000-0000-0000-0000-000000000999";
  const analytics = new AnalyticsStub();

  const router = await loadRouterWithStubs({
    "../services/supabaseClient": { getAnalyticsClient: () => analytics },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/feedback", router);

  const response = await request(app)
    .post("/api/feedback")
    .send({ interaction_id: interactionId, vote: "up" });

  assert.equal(response.status, 404);
  assert.equal(response.body?.message, "interaction_not_found");
  assert.equal(analytics.feedbackInserts.length, 0);
  assert.equal(analytics.banditInserts.length, 0);
  assert.equal(analytics.rpcCalls.length, 0);
});

test("POST /api/feedback falha com payload inválido", async () => {
  const analytics = new AnalyticsStub();

  const router = await loadRouterWithStubs({
    "../services/supabaseClient": { getAnalyticsClient: () => analytics },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/feedback", router);

  const response = await request(app).post("/api/feedback").send({});

  assert.equal(response.status, 400);
  assert.equal(response.body?.message, "missing vote");
  assert.equal(analytics.banditInserts.length, 0);
  assert.equal(analytics.rpcCalls.length, 0);
});
