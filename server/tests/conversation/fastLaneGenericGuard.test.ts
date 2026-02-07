import test from "node:test";
import assert from "node:assert/strict";

import { runFastLaneLLM } from "../../services/conversation/fastLane";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";

const makeFinalizerStub = () => {
  const calls: any[] = [];
  return {
    calls,
    finalizer: {
      finalize: async (params: any) => {
        calls.push(params);
        return { message: params.raw };
      },
    },
  };
};

test("runFastLaneLLM substitui resposta genérica por plano personalizado", async () => {
  const { calls, finalizer } = makeFinalizerStub();

  const result = await runFastLaneLLM({
    messages: [
      { role: "user", content: "Oi, estou exausta com o trabalho e nada anda." },
    ],
    userName: "Ana Paula",
    ultimaMsg: "Oi, estou exausta com o trabalho e nada anda.",
    hasAssistantBefore: false,
    userId: "user-123",
    supabase: {},
    lastMessageId: "msg-1",
    startedAt: Date.now(),
    deps: {
      claudeClient: async () => ({ content: "Como posso te ajudar?", usage: null, model: "stub" }),
      responseFinalizer: finalizer,
      firstName: (name?: string) => (name ? name.split(/\s+/)[0] : undefined),
    },
    sessionMeta: undefined,
    ecoDecision: computeEcoDecision("Oi, estou exausta com o trabalho e nada anda."),
  });

  assert.equal(calls.length, 1);
  const finalizerInput = calls[0];
  assert.match(finalizerInput.raw, /respostas prontas/i);
  assert.match(finalizerInput.raw, /exaust/);

  assert.notStrictEqual(result.raw, "Olá! Como posso ajudar?");
  assert.match(result.raw, /exaust/);
  assert.ok(result.response.plan);
  assert.equal(result.response.planContext?.origem, "auto_reply_guard");
  assert.ok(result.response.planContext?.motivos?.includes("como_posso_ajudar"));
});
