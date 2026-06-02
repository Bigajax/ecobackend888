import test from "node:test";
import assert from "node:assert/strict";

import type { GetEcoResult } from "../../utils";

const Module = require("node:module");

process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_ANON_KEY ??= "anon";

interface OrchestratorSetupOptions {
  planHint: any | null;
  materializedScore?: number;
}

function setupOrchestratorTest({ planHint, materializedScore = 0.85 }: OrchestratorSetupOptions) {
  const originalLoad = Module._load;
  const modulePath = require.resolve("../../services/ConversationOrchestrator");
  // Módulos transitivos que capturam os stubs no topo (binding fixado no 1º require).
  // Sem limpar o cache deles, o 2º teste reusa o materializeHints do 1º (score stale).
  const transientPaths = [
    require.resolve("../../services/decision/calPlanner"),
    require.resolve("../../services/decision/pathSelector"),
  ];
  const purgeCache = () => {
    delete require.cache[modulePath];
    for (const p of transientPaths) delete require.cache[p];
  };
  const capturedPrompts: any[][] = [];

  Module._load = function patched(request: string, parent: any, isMain: boolean) {
    if (request === "../adapters/SupabaseAdapter") {
      return { supabaseWithBearer: () => ({}) };
    }
    if (request === "../core/ResponsePlanner" || request === "../../core/ResponsePlanner") {
      return {
        planHints: () => (planHint ? { ...planHint } : null),
      };
    }
    if (request === "../core/ResponseGenerator" || request === "../../core/ResponseGenerator") {
      return {
        materializeHints: (hints: any, _text: string) => {
          if (!hints) return null;
          return {
            ...hints,
            score: materializedScore,
            soft_opening: "abra leve",
            mirror_suggestion: "espelhe a fala",
          };
        },
      };
    }
    if (request === "./conversation/preLLMPipeline") {
      return { handlePreLLMShortcuts: async () => null };
    }
    if (request === "./conversation/greeting") {
      return { defaultGreetingPipeline: { handle: () => ({ handled: false }) } };
    }
    if (request === "./conversation/router" || request === "../conversation/router") {
      return {
        defaultConversationRouter: {
          decide: () => ({
            mode: "full",
            vivaAtivo: false,
            lowComplexity: false,
            hasAssistantBefore: false,
            nivelRoteador: 2,
          }),
        },
      };
    }
    if (request === "./conversation/contextPreparation") {
      return {
        prepareConversationContext: async () => ({
          systemPrompt: "BASE_PROMPT",
          context: { flags: {}, meta: {}, continuity: null },
        }),
      };
    }
    if (request === "./conversation/promptPlan") {
      return {
        selectBanditArms: () => ({}),
        buildFullPrompt: ({ messages }: { messages: any[] }) => ({
          prompt: [
            { role: "system", content: "STYLE\nBASE_PROMPT" },
            ...messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
          ],
          maxTokens: 200,
        }),
      };
    }
    if (request === "./orchestration/fullPath") {
      return {
        runFullPath: async (params: any) => {
          capturedPrompts.push(params.llmParams.prompt);
          return params.llmParams.decision?.hasAssistantBefore
            ? ({ message: "assistido" } as GetEcoResult)
            : ({ message: "final" } as GetEcoResult);
        },
      };
    }
    if (request === "./orchestration/streamingPath") {
      return {
        finalizePreLLM: (finalize: any) => finalize,
        runStreamingPath: async (params: any) => {
          capturedPrompts.push(params.llmParams.prompt);
          return {
            raw: "stream",
            modelo: "stub",
            usage: null,
            timings: {},
            finalize: async () => ({ message: "stream" } as GetEcoResult),
          };
        },
      };
    }
    if (request === "./conversation/responseFinalizer") {
      return {
        defaultResponseFinalizer: {
          finalize: async (params: any) => ({ message: params.raw }),
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  purgeCache();
  const orchestrator = require(modulePath) as typeof import("../../services/ConversationOrchestrator");

  const cleanup = () => {
    Module._load = originalLoad;
    purgeCache();
  };

  return { orchestrator, capturedPrompts, cleanup };
}

test("injeta eco hints como system quando score alto", async (t) => {
  process.env.ECO_CAL_MODE = "on";
  const planHint = {
    key: "ansiedade",
    priority: 1,
    score: 0.82,
    flags: ["needs_grounding"],
    emotions: ["ansiedade"],
    intent: "stabilize",
  };

  const { orchestrator, capturedPrompts, cleanup } = setupOrchestratorTest({ planHint });
  t.after(cleanup);

  await orchestrator.getEcoResponse({
    messages: [{ role: "user", content: "estou muito ansiosa" }],
    userId: "user-hints",
    accessToken: "token",
  });

  assert.strictEqual(capturedPrompts.length, 1, "deve capturar prompt para execução full");
  const prompt = capturedPrompts[0];
  assert.ok(Array.isArray(prompt));
  const systemMessages = prompt.filter((msg: any) => msg.role === "system");
  assert.strictEqual(systemMessages.length, 2, "deve haver duas mensagens system");
  assert.ok(systemMessages[0].content.startsWith("ECO_HINTS"));
  assert.ok(systemMessages[1].content.includes("BASE_PROMPT"));
});

test("não injeta eco hints quando score insuficiente", async (t) => {
  process.env.ECO_CAL_MODE = "on";
  const planHint = {
    key: "tristeza",
    priority: 2,
    score: 0.5,
    flags: ["needs_validation"],
    emotions: ["tristeza"],
    intent: "hold_space",
  };

  const { orchestrator, capturedPrompts, cleanup } = setupOrchestratorTest({
    planHint,
    materializedScore: 0.5,
  });
  t.after(cleanup);

  await orchestrator.getEcoResponse({
    messages: [{ role: "user", content: "um pouco triste" }],
    userId: "user-low",
    accessToken: "token",
  });

  const prompt = capturedPrompts[0];
  const systemMessages = prompt.filter((msg: any) => msg.role === "system");
  assert.strictEqual(systemMessages.length, 1, "somente system base deve permanecer");
  assert.ok(!systemMessages[0].content.startsWith("ECO_HINTS"));
});
