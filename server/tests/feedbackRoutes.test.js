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
    this.banditUpserts = [];
    this.rpcCalls = [];
  }

  from(table) {
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
        upsert: (rows, options) => {
          this.banditUpserts.push({ table, rows, options });
          return {
            select: async () => ({ data: rows, error: this.config.banditError ?? null }),
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
  const analytics = new AnalyticsStub({ moduleKey: "arm-inferido" });

  const router = await loadRouterWithStubs({
    "../services/supabaseClient": { getAnalyticsClient: () => analytics },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/feedback", router);

  const response = await request(app)
    .post("/api/feedback")
    .send({ interaction_id: "00000000-0000-0000-0000-000000000111", vote: "up" });

  assert.equal(response.status, 204);
  assert.equal(response.text ?? "", "");
  assert.deepEqual(response.body ?? {}, {});
  assert.equal(analytics.feedbackInserts.length, 1);
  assert.equal(analytics.banditUpserts.length, 1);
  assert.equal(analytics.rpcCalls.length, 1);

  const upsert = analytics.banditUpserts[0];
  assert.deepEqual(upsert.rows[0], {
    response_id: "00000000-0000-0000-0000-000000000111",
    pilar: "default",
    arm: "arm-inferido",
    recompensa: 1,
  });
  assert.deepEqual(upsert.options, { onConflict: "response_id,arm", ignoreDuplicates: true });

  assert.deepEqual(analytics.rpcCalls[0], {
    name: "update_bandit_arm",
    params: { p_arm_key: "arm-inferido", p_reward: 1 },
  });
});

test("POST /api/feedback aceita response_id sem interaction_id", async () => {
  const analytics = new AnalyticsStub();

  const router = await loadRouterWithStubs({
    "../services/supabaseClient": { getAnalyticsClient: () => analytics },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/feedback", router);

  const response = await request(app)
    .post("/api/feedback")
    .send({ response_id: "00000000-0000-0000-0000-000000000222", vote: "down", arm: "arm-x", pillar: "geral" });

  assert.equal(response.status, 204);
  assert.equal(response.text ?? "", "");
  assert.deepEqual(response.body ?? {}, {});
  assert.equal(analytics.feedbackInserts.length, 0);
  assert.equal(analytics.banditUpserts.length, 1);
  assert.equal(analytics.rpcCalls.length, 1);

  const upsert = analytics.banditUpserts[0];
  assert.deepEqual(upsert.rows[0], {
    response_id: "00000000-0000-0000-0000-000000000222",
    pilar: "geral",
    arm: "arm-x",
    recompensa: 0,
  });
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
  assert.equal(analytics.banditUpserts.length, 0);
  assert.equal(analytics.rpcCalls.length, 0);
});
