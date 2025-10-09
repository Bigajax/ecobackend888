import test from "node:test";
import assert from "node:assert";

import {
  detectExplicitAskForSteps,
  runFastLaneLLM,
  type RunFastLaneLLMResult,
} from "../../services/conversation/fastLane";
import { planCuriousFallback } from "../../core/ResponsePlanner";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";

function createDeps(overrides: Partial<{
  claudeClient: any;
  responseFinalizer: any;
  firstName: any;
}> = {}) {
  const claudeCalls: any[] = [];
  const finalizeCalls: any[] = [];

  const claudeClient = overrides.claudeClient
    ? overrides.claudeClient
    : async (params: any) => {
        claudeCalls.push(params);
        return { content: "ok", usage: { total_tokens: 42 }, model: "test-model" };
      };

  const responseFinalizer = overrides.responseFinalizer
    ? overrides.responseFinalizer
    : {
        finalize: async (params: any) => {
          finalizeCalls.push(params);
          return { message: `final:${params.raw}` };
        },
      };

  const firstName = overrides.firstName
    ? overrides.firstName
    : (value?: string) => value?.split(" ")[0] ?? "";

  return {
    claudeCalls,
    finalizeCalls,
    deps: {
      claudeClient,
      responseFinalizer,
      firstName,
    },
  };
}

test("detectExplicitAskForSteps reconhece pedidos explícitos", () => {
  assert.ok(detectExplicitAskForSteps("pode me mostrar os passos?"));
  assert.ok(detectExplicitAskForSteps("como faço pra lidar com isso"));
  assert.ok(detectExplicitAskForSteps("preciso de um guia ou checklist"));
  assert.strictEqual(detectExplicitAskForSteps("quero refletir sobre um sentimento"), false);
});

test("runFastLaneLLM envia apenas as 3 últimas mensagens do histórico", async () => {
  const history = [
    { role: "user", content: "mensagem 1" },
    { role: "assistant", content: "mensagem 2" },
    { role: "user", content: "mensagem 3" },
    { role: "assistant", content: "mensagem 4" },
    { role: "user", content: "mensagem 5" },
  ];

  const { deps, claudeCalls, finalizeCalls } = createDeps();

  const result = (await runFastLaneLLM({
    messages: history,
    userName: "Ana Maria",
    ultimaMsg: "mensagem 5",
    hasAssistantBefore: true,
    userId: "user-123",
    supabase: { tag: "db" },
    lastMessageId: "msg-5",
    startedAt: 1000,
    deps,
    sessionMeta: { distinctId: "distinct-xyz" },
    ecoDecision: computeEcoDecision("mensagem 5"),
  })) as RunFastLaneLLMResult;

  assert.strictEqual(claudeCalls.length, 1);
  const sentMessages = claudeCalls[0].messages;
  assert.strictEqual(sentMessages.length, 4); // system + 3 últimas mensagens
  assert.deepStrictEqual(
    sentMessages.slice(1).map((m: any) => m.content),
    ["mensagem 3", "mensagem 4", "mensagem 5"]
  );

  assert.strictEqual(result.raw, "ok");
  assert.deepStrictEqual(result.usage, { total_tokens: 42 });
  assert.strictEqual(result.model, "test-model");
  assert.deepStrictEqual(result.response, { message: "final:ok" });

  assert.strictEqual(finalizeCalls.length, 1);
  assert.strictEqual(finalizeCalls[0].raw, "ok");
  assert.strictEqual(finalizeCalls[0].usageTokens, 42);
  assert.strictEqual(finalizeCalls[0].modelo, "test-model");
  assert.strictEqual(finalizeCalls[0].mode, "fast");
  assert.strictEqual(
    finalizeCalls[0].sessionMeta?.distinctId,
    "distinct-xyz",
    "finalize recebe sessionMeta"
  );
});

test("runFastLaneLLM usa fallback quando o cliente Claude falha", async () => {
  const fallbackError = new Error("claude indisponível");
  const fallbackCalls: any[] = [];
  const expectedFallback = planCuriousFallback("oi").text;

  const { deps } = createDeps({
    claudeClient: async () => {
      throw fallbackError;
    },
    responseFinalizer: {
      finalize: async (params: any) => {
        fallbackCalls.push(params);
        return { message: params.raw };
      },
    },
  });

  const result = await runFastLaneLLM({
    messages: [{ role: "user", content: "oi" }],
    userName: "João",
    ultimaMsg: "oi",
    hasAssistantBefore: false,
    userId: "user-999",
    supabase: null,
    lastMessageId: undefined,
    startedAt: 123,
    deps,
    sessionMeta: { distinctId: "fallback-1" },
    ecoDecision: computeEcoDecision("oi"),
  });

  assert.strictEqual(result.raw, expectedFallback);
  assert.strictEqual(result.model, "fastlane-fallback");
  assert.strictEqual(result.usage, null);
  assert.deepStrictEqual(result.response, {
    message: expectedFallback,
  });
  assert.strictEqual(fallbackCalls.length, 1);
  assert.strictEqual(
    fallbackCalls[0].modelo,
    "fastlane-fallback",
    "finalizer recebe modelo de fallback"
  );
});

test("STYLE_SELECTOR alterna entre coach e espelho conforme o pedido", async () => {
  const recordedSystems: string[] = [];

  const claudeClient = async (params: any) => {
    recordedSystems.push(params.messages[0].content);
    return { content: "ok", usage: null, model: "style-test" };
  };

  const { deps } = createDeps({ claudeClient });

  await runFastLaneLLM({
    messages: [{ role: "user", content: "pode me dar passos?" }],
    userName: "Carlos Silva",
    ultimaMsg: "pode me dar passos?",
    hasAssistantBefore: false,
    userId: undefined,
    supabase: undefined,
    lastMessageId: undefined,
    startedAt: 0,
    deps,
    ecoDecision: computeEcoDecision("pode me dar passos?"),
  });

  await runFastLaneLLM({
    messages: [{ role: "user", content: "quero apenas refletir" }],
    userName: "Carlos Silva",
    ultimaMsg: "quero apenas refletir",
    hasAssistantBefore: false,
    userId: undefined,
    supabase: undefined,
    lastMessageId: undefined,
    startedAt: 0,
    deps,
    ecoDecision: computeEcoDecision("quero apenas refletir"),
  });

  assert.strictEqual(recordedSystems.length, 2);
  assert.ok(recordedSystems[0].includes("Preferir plano COACH"));
  assert.ok(recordedSystems[1].includes("Preferir plano ESPELHO"));
});
