import test from "node:test";
import assert from "node:assert/strict";

const Module = require("node:module");

process.env.OPENROUTER_API_KEY ??= "test-key";

test("ConversationOrchestrator normalizes nullable values", async (t) => {
  const modulePath = require.resolve("../../services/ConversationOrchestrator");
  const originalLoad = Module._load;

  let capturedClientHour: unknown;
  let capturedContextTracer: unknown;
  let capturedAnalyticsTracer: unknown;

  Module._load = function patched(request: string, parent: any, isMain: boolean) {
    if (request === "./promptContext/logger") {
      const log = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        trace: () => {},
        withContext: () => log,
      } as const;
      return { log, isDebug: () => false };
    }
    if (request === "../analytics/events/mixpanelEvents") {
      return { trackRetrieveMode: () => {} };
    }
    if (request === "./conversation/helpers") {
      return { firstName: (input: string) => input };
    }
    if (request === "./conversation/preLLMPipeline") {
      return {
        handlePreLLMShortcuts: async (params: { clientHour?: number }) => {
          capturedClientHour = params.clientHour;
          return null;
        },
      };
    }
    if (request === "./conversation/greeting") {
      return { defaultGreetingPipeline: { handle: () => ({ handled: false }) } };
    }
    if (request === "./conversation/fastLane") {
      return { runFastLaneLLM: async () => ({ response: null }) };
    }
    if (request === "./conversation/contextPreparation") {
      return {
        prepareConversationContext: async (options: any) => {
          capturedContextTracer = options.activationTracer;
          return {
            systemPrompt: "BASE_PROMPT",
            context: {
              flags: {},
              meta: {},
              continuity: {},
              sources: {},
              memsSemelhantes: [],
            },
          };
        },
      };
    }
    if (request === "./conversation/promptPlan") {
      return {
        buildFullPrompt: ({ messages }: { messages: any[] }) => ({
          prompt: [
            { role: "system", content: "STYLE" },
            ...messages,
          ],
          maxTokens: 128,
        }),
      };
    }
    if (request === "./conversation/responseFinalizer") {
      return { defaultResponseFinalizer: { finalize: async (input: any) => input.raw } };
    }
    if (request === "./conversation/ecoDecisionHub") {
      return {
        computeEcoDecision: () => ({
          intensity: 0.5,
          openness: 2,
          saveMemory: true,
          hasTechBlock: false,
          debug: {},
          signals: {},
        }),
        MEMORY_THRESHOLD: 0.75,
      };
    }
    if (request === "./decision/pathSelector") {
      return {
        decideRoute: () => ({
          mode: "full",
          vivaAtivo: false,
          lowComplexity: false,
          nivelRoteador: 2,
          hasAssistantBefore: false,
        }),
        inferRetrieveMode: () => ({
          mode: "default",
          reason: "stub",
          wordCount: 0,
          charLength: 0,
        }),
        shouldUseFastLane: () => false,
      };
    }
    if (request === "./decision/calPlanner") {
      return {
        computeCalHints: () => ({ calHints: null }),
        injectCalHints: ({ prompt }: { prompt: any[] }) => ({ prompt, injected: false }),
      };
    }
    if (request === "./orchestration/streamingPath") {
      return {
        finalizePreLLM: (finalize: any) => finalize,
        runStreamingPath: async () => {
          throw new Error("streaming path not expected in normalization test");
        },
      };
    }
    if (request === "./orchestration/fullPath") {
      return {
        runFullPath: async (options: any) => {
          capturedAnalyticsTracer = options.analytics.activationTracer;
          return { message: "ok", meta: { analytics: { response_id: null } } };
        },
      };
    }
    if (request === "./analytics/analyticsOrchestrator") {
      return {
        persistAnalyticsSafe: async () => {},
      };
    }
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[modulePath];
  const orchestrator = require(modulePath) as typeof import("../../services/ConversationOrchestrator");

  t.after(() => {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  });

  const result = await orchestrator.getEcoResponse({
    messages: [{ role: "user", content: "olá" }],
    userId: "user-123",
    mems: [],
    clientHour: null,
    activationTracer: null,
  } as any);

  assert.equal(result?.message, "ok");
  assert.equal(capturedClientHour, undefined);
  assert.equal(capturedContextTracer, undefined);
  assert.equal(capturedAnalyticsTracer, undefined);
});
