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
    const resolved = require.resolve("../../routes/signalRoutes");
    const controller = require.resolve("../../controllers/signalController");
    const client = require.resolve("../../services/supabaseClient");
    delete require.cache[resolved];
    delete require.cache[controller];
    delete require.cache[client];
    const mod = require("../../routes/signalRoutes");
    return mod.default ?? mod;
  });
};

class AnalyticsStub {
  constructor() {
    this.interactionLookups = [];
    this.passiveSignalInserts = [];
  }

  from(table) {
    if (table === "eco_interactions") {
      const query = {
        select: () => query,
        eq: (_column, value) => {
          this.interactionLookups.push({ table, value });
          return query;
        },
        maybeSingle: async () => ({ data: { id: "interaction-123" }, error: null }),
      };
      return query;
    }

    if (table === "eco_passive_signals") {
      return {
        insert: async (rows) => {
          this.passiveSignalInserts.push(...rows);
          return { error: null };
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  }
}

test("POST /api/signal persiste payload e responde 204 vazio", async () => {
  const analytics = new AnalyticsStub();
  const router = await loadRouterWithStubs({
    "../services/supabaseClient": { getAnalyticsClient: () => analytics },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/signal", router);

  const response = await request(app)
    .post("/api/signal")
    .set("X-Eco-Interaction-Id", "interaction-123")
    .send({ signal: "view", interaction_id: "interaction-123" });

  assert.equal(response.status, 204);
  assert.equal(response.text ?? "", "");
  assert.deepEqual(response.body ?? {}, {});
  assert.equal(analytics.interactionLookups.length, 1);
  assert.equal(analytics.passiveSignalInserts.length, 1);
});
