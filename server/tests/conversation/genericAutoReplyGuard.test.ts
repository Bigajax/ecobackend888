import test from "node:test";
import assert from "node:assert/strict";

import { detectGenericAutoReply } from "../../services/conversation/genericAutoReplyGuard";
import {
  construirRespostaPersonalizada,
  sugerirPlanoResposta,
} from "../../services/conversation/responsePlanner";

test("detectGenericAutoReply identifica saudações genéricas", () => {
  const analysis = detectGenericAutoReply("Olá! Como posso ajudar?");
  assert.equal(analysis.isGeneric, true);
  assert.ok(analysis.matches.includes("como_posso_ajudar"));
  assert.ok(analysis.score >= 4);
});

test("detectGenericAutoReply não marca respostas específicas", () => {
  const analysis = detectGenericAutoReply(
    "Sinto o peso disso tudo. Onde isso pega mais forte em você hoje?"
  );
  assert.equal(analysis.isGeneric, false);
});

test("planner gera foco específico para ansiedade", () => {
  const plan = sugerirPlanoResposta(
    "Sinto ansiedade toda vez que penso no trabalho e no quanto estou atrasado."
  );
  assert.match(plan.foco, /ansiedade/i);
  assert.ok(Array.isArray(plan.passos));
  assert.ok(plan.passos.length >= 3);

  const resposta = construirRespostaPersonalizada(
    "Sinto ansiedade toda vez que penso no trabalho.",
    plan
  );
  assert.match(resposta, /ansiedade/i);
  assert.match(resposta, /trabalho/i);
  assert.match(resposta, /respostas prontas/i);
});
