import test from "node:test";
import assert from "node:assert/strict";

import { DERIVADOS_CACHE } from "../../services/CacheService";

const Module = require("node:module");

const originalTimeoutEnv = process.env.ECO_DERIVADOS_TIMEOUT_MS;

process.env.OPENROUTER_API_KEY ??= "test-key";

test("streaming segue sem derivados e cache é preenchido quando prontos", async (t) => {
  process.env.ECO_DERIVADOS_TIMEOUT_MS = "5";

  const expectedDerivados = { tema: "sono", resumo: "cached" };
  let capturedDerivadosParam: any = undefined;

  const supabaseDelayMs = 50;
  const originalLoad = Module._load;
  const modulePath = require.resolve("../../services/ConversationOrchestrator");

  function createSupabaseStub(delay: number) {
    const datasets: Record<string, any[]> = {
      user_theme_stats: [{ tema: "sono" }],
      user_temporal_milestones: [{ tema: "sono", resumo_evolucao: "ok" }],
      interaction_effects: [{ efeito: "calma", score: 0.5 }],
    };

    return {
      from(table: string) {
        const data = datasets[table] ?? [];
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return new Promise((resolve) => {
              setTimeout(() => resolve({ data }), delay);
            });
          },
        };
      },
      rpc() {
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  Module._load = function patched(request: string, parent: any, isMain: boolean) {
    if (request === "../adapters/SupabaseAdapter") {
      return {
        supabaseWithBearer: () => createSupabaseStub(supabaseDelayMs),
      };
    }
    if (request === "../core/ResponsePlanner") {
      return { planHints: () => null };
    }
    if (request === "../core/ResponseGenerator") {
      return { materializeHints: () => null };
    }
    if (request === "./conversation/greeting") {
      return {
        defaultGreetingPipeline: {
          handle: () => ({ handled: false }),
        },
      };
    }
    if (request === "./conversation/router") {
      return {
        defaultConversationRouter: {
          decide: () => ({
            mode: "full",
            vivaAtivo: false,
            lowComplexity: false,
            nivelRoteador: 2,
            hasAssistantBefore: false,
          }),
        },
      };
    }
    if (request === "./conversation/parallelFetch") {
      return {
        defaultParallelFetchService: {
          run: async () => ({
            heuristicas: [],
            userEmbedding: [],
            memsSemelhantes: [],
          }),
        },
      };
    }
    if (request === "./conversation/contextCache") {
      return {
        defaultContextCache: {
          build: async (params: any) => {
            capturedDerivadosParam = params.derivados;
            return "system prompt";
          },
        },
      };
    }
    if (request === "./conversation/promptPlan") {
      return {
        buildFullPrompt: ({ messages }: { messages: any[] }) => ({
          prompt: [
            { role: "system", content: "system prompt" },
            ...messages,
          ],
          maxTokens: 200,
        }),
      };
    }
    if (request === "./conversation/responseFinalizer") {
      return {
        defaultResponseFinalizer: {
          normalizeRawResponse: ({ raw }: any) => ({
            base: raw,
            identityCleaned: raw,
            cleaned: raw,
            blocoTarget: raw,
          }),
          gerarBlocoComTimeout: () => ({
            race: Promise.resolve(null),
            full: Promise.resolve(null),
          }),
          finalize: async ({ raw }: any) => ({ message: raw }),
        },
      };
    }
    if (request === "../core/ClaudeAdapter") {
      return {
        streamClaudeChatCompletion: async (_opts: any, callbacks: any) => {
          await callbacks.onChunk?.({ content: "resposta final", raw: {} });
          await callbacks.onControl?.({
            type: "done",
            finishReason: "stop",
            usage: { total_tokens: 10 },
            model: "stub-model",
          });
        },
        claudeChatCompletion: async () => ({
          content: "resposta final",
          model: "stub-model",
          usage: { total_tokens: 10 },
        }),
      };
    }
    if (request === "../services/derivadosService") {
      return {
        getDerivados: () => expectedDerivados,
        insightAbertura: () => ({ abertura: true }),
      };
    }

    return originalLoad(request, parent, isMain);
  };

  t.after(() => {
    Module._load = originalLoad;
    delete require.cache[modulePath];
    DERIVADOS_CACHE.clear();
    if (originalTimeoutEnv === undefined) {
      delete process.env.ECO_DERIVADOS_TIMEOUT_MS;
    } else {
      process.env.ECO_DERIVADOS_TIMEOUT_MS = originalTimeoutEnv;
    }
  });

  DERIVADOS_CACHE.clear();
  delete require.cache[modulePath];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const orchestrator = require(modulePath) as typeof import("../../services/ConversationOrchestrator");
  Module._load = originalLoad;

  const events: any[] = [];
  let cacheAtPromptReady: any = undefined;
  const cacheKey = "derivados:user-lento";

  const streaming = (await orchestrator.getEcoResponse({
    messages: [{ role: "user", content: "preciso de ajuda" }],
    userId: "user-lento",
    userName: "Alice",
    accessToken: "token",
    stream: {
      onEvent: async (event: any) => {
        events.push(event);
        if (event.type === "control" && event.name === "prompt_ready") {
          cacheAtPromptReady = DERIVADOS_CACHE.get(cacheKey) ?? null;
        }
      },
    },
  })) as import("../../services/ConversationOrchestrator").EcoStreamingResult;

  assert.strictEqual(capturedDerivadosParam, null, "contexto deve receber derivados nulos quando timeout");
  assert.ok(
    events.some((event) => event.type === "control" && event.name === "prompt_ready"),
    "deve emitir prompt_ready mesmo sem derivados"
  );
  assert.strictEqual(cacheAtPromptReady, null, "cache não deve estar preenchido no prompt_ready");

  await new Promise((resolve) => setTimeout(resolve, supabaseDelayMs * 2));

  const cached = DERIVADOS_CACHE.get(cacheKey);
  assert.deepStrictEqual(cached, expectedDerivados, "cache deve ser preenchido após fetch em background");
  assert.strictEqual(streaming.raw, "resposta final");
});
