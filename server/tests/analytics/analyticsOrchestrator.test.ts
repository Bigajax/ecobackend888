import test from "node:test";
import assert from "node:assert/strict";

const Module = require("node:module");

test("persistAnalyticsRecords skips when meta is missing", async (t) => {
  const modulePath = require.resolve("../../services/analytics/analyticsOrchestrator");
  const originalLoad = Module._load;
  let ensureCalls = 0;

  Module._load = function patched(request: string, parent: any, isMain: boolean) {
    if (request === "../../lib/supabaseAdmin") {
      return {
        __esModule: true,
        ensureSupabaseConfigured: () => {
          ensureCalls += 1;
          throw new Error("ensureSupabaseConfigured should not run");
        },
        default: { schema: () => ({}) },
      };
    }
    if (request === "../promptContext/logger") {
      return {
        log: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
      };
    }
    if (request === "./insertHelpers") {
      return {
        buildBanditRows: () => [],
        buildHeuristicRows: () => [],
        buildKnapsackRows: () => [],
        buildLatencyRow: () => null,
        buildModuleRows: () => [],
        buildResponseRow: () => ({}),
        createInsertRows: () => () => Promise.resolve(),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[modulePath];
  const analytics = require(modulePath) as typeof import("../../services/analytics/analyticsOrchestrator");

  t.after(() => {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  });

  await analytics.persistAnalyticsRecords({
    result: { meta: undefined } as any,
    retrieveMode: "default" as any,
    activationTracer: null,
    userId: null,
  });

  assert.equal(ensureCalls, 0);
});
