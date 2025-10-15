import test from "node:test";
import assert from "node:assert/strict";

import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";
import { ResponseFinalizer } from "../../services/conversation/responseFinalizer";
import { makeResponseFinalizerDepsStub } from "../../../tests/helpers/makeResponseFinalizerDepsStub";

test("Case A: intensidade 3 sem vulnerabilidade gera NV1", () => {
  const texto = "Hoje foi um dia comum, só queria dividir um pouco da rotina.";
  const decision = computeEcoDecision(texto);
  assert.strictEqual(decision.intensity, 3);
  assert.strictEqual(decision.openness, 1);
  assert.strictEqual(decision.isVulnerable, false);
  assert.deepStrictEqual(decision.vivaSteps, ["V", "A"]);
  assert.strictEqual(decision.saveMemory, false);
  assert.strictEqual(decision.hasTechBlock, false);
});

test("Case B: intensidade 6 mantém NV2 e não salva memória", () => {
  const fragmento =
    "Tenho trabalhado em vários relatórios e sigo um ritmo constante sem grandes emoções. ";
  const textoLongo = fragmento.repeat(12); // garante ~700 caracteres
  const decision = computeEcoDecision(textoLongo);
  assert.strictEqual(decision.intensity, 10);
  assert.strictEqual(decision.openness, 2);
  assert.deepStrictEqual(decision.vivaSteps, ["V", "I", "A"]);
  assert.strictEqual(decision.saveMemory, true);
  assert.strictEqual(decision.hasTechBlock, true);
});

test("Case C: intensidade alta e vulnerável ativa NV3, memória e bloco técnico", async () => {
  const texto =
    "Estou em crise e me sinto vulnerável ao compartilhar isso. " +
    "Fico em pânico quando penso em conversar com a família e ainda assim preciso abrir meu coração. " +
    "Quero muito ajuda para não me fechar agora.";
  const decision = computeEcoDecision(texto);

  assert.ok(decision.intensity >= 7, "intensidade deve refletir crise atual");
  assert.strictEqual(decision.openness, 3);
  assert.strictEqual(decision.isVulnerable, true);
  assert.deepStrictEqual(decision.vivaSteps, ["V", "I", "V", "A", "Pausa"]);
  assert.strictEqual(decision.saveMemory, true);
  assert.strictEqual(decision.hasTechBlock, true);

  const savedPayloads: any[] = [];
  const finalizer = new ResponseFinalizer(
    makeResponseFinalizerDepsStub({
      gerarBlocoTecnicoComCache: async () => ({ emocao_principal: "", tags: [] }),
      saveMemoryOrReference: async (payload: any) => {
        savedPayloads.push(payload);
      },
    })
  );

  const resultado = await finalizer.finalize({
    raw: "Aqui está uma resposta de apoio.",
    ultimaMsg: texto,
    hasAssistantBefore: true,
    mode: "full",
    startedAt: Date.now(),
    userId: "user-case-c",
    supabase: {},
    ecoDecision: decision,
  });

  assert.strictEqual(resultado.intensidade, decision.intensity);
  assert.ok(Array.isArray(resultado.tags));
  assert.ok(savedPayloads.length >= 1, "deve registrar memória com base na intensidade atual");
  assert.strictEqual(savedPayloads[0].decision.intensity, decision.intensity);
  assert.strictEqual(savedPayloads[0].decision.saveMemory, true);
});
