/**
 * crisisGuard.test.ts — Onda 1A: gate determinístico de crise.
 * Roda via `npm run test:node` (node:test + ts-node), sem env do Supabase.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isAcuteCrisis, CRISIS_RESPONSE } from "../../services/conversation/crisisGuard";
import { handlePreLLMShortcuts } from "../../services/conversation/preLLMPipeline";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";

test("[crise] isAcuteCrisis dispara em ideação/autolesão", () => {
  for (const msg of ["penso em me matar", "queria acabar com tudo", "pensei em tirar minha vida"]) {
    assert.equal(isAcuteCrisis(computeEcoDecision(msg)), true, `deveria ser crise: "${msg}"`);
  }
});

test("[crise] isAcuteCrisis NÃO dispara em tristeza/cansaço (falso-positivo)", () => {
  for (const msg of [
    "estou muito cansado e triste hoje",
    "ando meio pra baixo e desanimado",
    "to estressado com o trabalho",
  ]) {
    assert.equal(isAcuteCrisis(computeEcoDecision(msg)), false, `NÃO deveria ser crise: "${msg}"`);
  }
});

function makeDeps() {
  const calls: { finalizeParams?: any; greetingCalled: boolean } = { greetingCalled: false };
  const deps: any = {
    greetingPipeline: {
      handle: () => {
        calls.greetingCalled = true;
        return { handled: false };
      },
    },
    responseFinalizer: {
      finalize: async (params: any) => {
        calls.finalizeParams = params;
        return { message: params.raw };
      },
    },
    now: () => 1000,
  };
  return { deps, calls };
}

const baseParams = {
  thread: [],
  userId: "u-1",
  userName: null,
  supabase: null,
  hasAssistantBefore: false,
} as any;

test("[crise] short-circuit força CRISIS_RESPONSE, sem LLM (skipBloco) e sem greeting", async () => {
  const { deps, calls } = makeDeps();
  const handled = await handlePreLLMShortcuts(
    { ...baseParams, ultimaMsg: "penso em me matar" },
    deps
  );

  assert.ok(handled, "deveria retornar resultado (short-circuit)");
  assert.equal(handled!.kind, "final");
  assert.equal((handled as any).result.message, CRISIS_RESPONSE);
  assert.equal(calls.finalizeParams?.raw, CRISIS_RESPONSE);
  assert.equal(calls.finalizeParams?.skipBloco, true, "skipBloco=true garante zero LLM");
  assert.equal(calls.finalizeParams?.modelo, "crisis_guard");
  assert.equal(calls.greetingCalled, false, "crise tem precedência sobre o greeting");
});

test("[crise] mensagem não-crise/não-saudação retorna null (segue para o LLM)", async () => {
  const { deps, calls } = makeDeps();
  const handled = await handlePreLLMShortcuts(
    { ...baseParams, ultimaMsg: "queria organizar minhas tarefas da semana" },
    deps
  );

  assert.equal(handled, null, "deveria seguir para o caminho normal");
  assert.equal(calls.finalizeParams, undefined, "finalize de crise não deve ser chamado");
});
