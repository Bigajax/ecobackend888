import test from "node:test";
import assert from "node:assert";

import { buildFullPrompt } from "../../services/conversation/promptPlan";
import type { RouteDecision } from "../../services/conversation/router";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";

function createDecision(overrides: Partial<RouteDecision> = {}): RouteDecision {
  const base: RouteDecision = {
    mode: "full",
    hasAssistantBefore: false,
    vivaAtivo: false,
    lowComplexity: false,
    nivelRoteador: 2,
    forceFull: false,
    decision: computeEcoDecision("teste"),
  };

  return { ...base, ...overrides, decision: overrides.decision ?? base.decision };
}

test("maxTokens respects length thresholds", () => {
  const baseParams = {
    decision: createDecision(),
    systemPrompt: "Contexto acumulado",
    messages: [],
  };

  const short = buildFullPrompt({
    ...baseParams,
    ultimaMsg: "Oi Eco",
  });
  assert.strictEqual(short.maxTokens, 420);

  const medium = buildFullPrompt({
    ...baseParams,
    ultimaMsg: "x".repeat(200),
  });
  assert.strictEqual(medium.maxTokens, 560);

  const long = buildFullPrompt({
    ...baseParams,
    ultimaMsg: "x".repeat(400),
  });
  assert.strictEqual(long.maxTokens, 700);
});

test("seleciona estilo coach quando usuário pede passos e viva está desligado", () => {
  const { prompt } = buildFullPrompt({
    decision: createDecision(),
    ultimaMsg: "Pode me dar passos concretos?",
    systemPrompt: "Contexto cacheado",
    messages: [
      { role: "user", content: "Mensagem antiga" },
      { role: "assistant", content: "Resposta antiga" },
    ],
    historyLimit: 1,
  });

  assert.ok(prompt[0].content.startsWith("Modo: COACH"));
  assert.strictEqual(prompt.length, 3);
  assert.strictEqual(prompt[2].content, "Resposta antiga");
});

test("mantém estilo espelho quando viva está ativo", () => {
  const { prompt } = buildFullPrompt({
    decision: createDecision({ vivaAtivo: true }),
    ultimaMsg: "Pode me dar passos concretos?",
    systemPrompt: "Contexto cacheado",
    messages: [],
  });

  assert.ok(prompt[0].content.startsWith("Modo: ESPELHO"));
});

test("system prompt combina seletor de estilo e contexto", () => {
  const contexto = "Contexto da cache";
  const { prompt } = buildFullPrompt({
    decision: createDecision({ nivelRoteador: 1 }),
    ultimaMsg: "Tudo bem?",
    systemPrompt: contexto,
    messages: [],
  });

  assert.ok(prompt[0].content.startsWith("Modo: COACH"));
  assert.ok(prompt[0].content.endsWith(`\n${contexto}`));
});
