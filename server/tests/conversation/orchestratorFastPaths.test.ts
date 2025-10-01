import test from "node:test";
import assert from "node:assert/strict";

import { type GetEcoResult } from "../../utils";
import { extractJson } from "../../utils/text";

const Module = require("node:module");

process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_ANON_KEY ??= "anon";

interface OrchestratorStubOptions {
  microResponse: string | null;
  greetingResult: { handled: boolean; response?: string };
  finalizerResult: GetEcoResult;
}

function setupOrchestratorTest({
  microResponse,
  greetingResult,
  finalizerResult,
}: OrchestratorStubOptions) {
  const originalLoad = Module._load;
  const finalizeCalls: any[] = [];
  const modulePath = require.resolve("../../services/ConversationOrchestrator");

  Module._load = function patched(request: string, parent: any, isMain: boolean) {
    if (request === "../adapters/SupabaseAdapter") {
      return { supabaseWithBearer: () => ({}) };
    }
    if (request === "../core/ResponseGenerator") {
      return { microReflexoLocal: () => microResponse };
    }
    if (request === "./conversation/greeting") {
      return {
        defaultGreetingPipeline: {
          handle: () => ({ ...greetingResult }),
        },
      };
    }
    if (request === "./conversation/responseFinalizer") {
      return {
        defaultResponseFinalizer: {
          finalize: async (params: any) => {
            finalizeCalls.push(params);
            return finalizerResult;
          },
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[modulePath];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const orchestrator = require(modulePath) as typeof import("../../services/ConversationOrchestrator");
    Module._load = originalLoad;
    return {
      orchestrator,
      finalizeCalls,
      cleanup: () => {
        delete require.cache[modulePath];
        Module._load = originalLoad;
      },
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

test("micro reflex streaming inclui bloco JSON finalizado", async (t) => {
  const finalizerResult: GetEcoResult = {
    message: "Resposta ajustada",
    intensidade: 0.7,
    resumo: "Resumo breve",
    emocao: "alegria",
    tags: ["apoio"],
    categoria: "apoio",
    proactive: null,
  };

  const { orchestrator, finalizeCalls, cleanup } = setupOrchestratorTest({
    microResponse: "resposta micro",
    greetingResult: { handled: false },
    finalizerResult,
  });
  t.after(cleanup);

  const events: any[] = [];
  const streaming = (await orchestrator.getEcoResponse({
    messages: [{ role: "user", content: "estou cansado" }],
    userId: "user-1",
    userName: "Ana",
    accessToken: "token",
    stream: {
      onEvent: async (event: any) => {
        events.push(event);
      },
    },
  })) as import("../../services/ConversationOrchestrator").EcoStreamingResult;

  const chunkEvents = events.filter((e) => e.type === "chunk");
  assert.strictEqual(chunkEvents.length, 1, "deve emitir exatamente um chunk");
  const finalText = chunkEvents[0].content as string;
  assert.ok(finalText.includes("```json"), "chunk final deve conter bloco JSON");

  const payload = extractJson<Record<string, any>>(finalText);
  assert.ok(payload, "JSON do chunk deve ser parseável");
  assert.strictEqual(payload?.intensidade, finalizerResult.intensidade);
  assert.strictEqual(payload?.resumo, finalizerResult.resumo);
  assert.deepStrictEqual(payload?.tags, finalizerResult.tags);
  assert.strictEqual(payload?.categoria, finalizerResult.categoria);

  assert.strictEqual(streaming.raw, finalText, "raw deve espelhar o texto final emitido");
  const resolved = await streaming.finalize();
  assert.deepStrictEqual(resolved, finalizerResult);

  assert.strictEqual(finalizeCalls.length, 1, "finalizer deve ser chamado uma vez");
  assert.strictEqual(finalizeCalls[0].modelo, "micro-reflexo");
  assert.strictEqual(finalizeCalls[0].mode, "fast");
  assert.strictEqual(finalizeCalls[0].hasAssistantBefore, false);
});

test("greeting streaming inclui bloco JSON finalizado", async (t) => {
  const finalizerResult: GetEcoResult = {
    message: "Oi, bora começar?",
    emocao: "neutra",
    tags: [],
    categoria: null,
    proactive: null,
  };

  const { orchestrator, finalizeCalls, cleanup } = setupOrchestratorTest({
    microResponse: null,
    greetingResult: { handled: true, response: "Olá!" },
    finalizerResult,
  });
  t.after(cleanup);

  const events: any[] = [];
  const streaming = (await orchestrator.getEcoResponse({
    messages: [{ role: "user", content: "oi" }],
    userId: "user-2",
    userName: "Bruno",
    accessToken: "token",
    stream: {
      onEvent: async (event: any) => {
        events.push(event);
      },
    },
  })) as import("../../services/ConversationOrchestrator").EcoStreamingResult;

  const chunkEvents = events.filter((e) => e.type === "chunk");
  assert.strictEqual(chunkEvents.length, 1, "saudação deve emitir único chunk");
  const finalText = chunkEvents[0].content as string;
  assert.ok(finalText.includes("```json"));

  const payload = extractJson<Record<string, any>>(finalText);
  assert.ok(payload);
  assert.strictEqual(payload?.emocao, finalizerResult.emocao);
  assert.deepStrictEqual(payload?.tags, finalizerResult.tags);

  assert.strictEqual(streaming.raw, finalText);
  const resolved = await streaming.finalize();
  assert.deepStrictEqual(resolved, finalizerResult);

  assert.strictEqual(finalizeCalls.length, 1);
  assert.strictEqual(finalizeCalls[0].modelo, "greeting");
  assert.strictEqual(finalizeCalls[0].mode, "fast");
  assert.strictEqual(finalizeCalls[0].hasAssistantBefore, false);
});
