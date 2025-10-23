import test from "node:test";
import assert from "node:assert/strict";

import montarContextoEco from "../../services/promptContext/ContextBuilder";
import { ModuleStore } from "../../services/promptContext/ModuleStore";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";
import { qualityAnalyticsStore } from "../../services/analytics/analyticsStore";

const inlineModules: Record<string, string> = {
  "developer_prompt.txt": "DP".repeat(20),
  "IDENTIDADE.txt": "ID".repeat(200),
  "identidade_mini.txt": "IM".repeat(40),
  "MODULACAO_TOM_REGISTRO.txt": "MT".repeat(40),
  "LINGUAGEM_NATURAL.txt": "LN".repeat(40),
  "ENCERRAMENTO_SENSIVEL.txt": "ES".repeat(30),
  "DETECÇÃOCRISE.txt": "DC".repeat(30),
  "PEDIDOPRÁTICO.txt": "PP".repeat(30),
  "escala_abertura_1a3.txt": "EA".repeat(40),
  "ESCALA_INTENSIDADE_0a10.txt": "EI".repeat(40),
  "metodo_viva_enxuto.txt": "MV".repeat(50),
  "bloco_tecnico_memoria.txt": "BT".repeat(40),
  "usomemorias.txt": "UM".repeat(40),
  "PRINCIPIOS_CHAVE.txt": "PC".repeat(60),
  "ANTISALDO_MIN.txt": "AM".repeat(30),
  "eco_estrutura_de_resposta.txt": "EE".repeat(60),
  "nv1_core.txt": "NV".repeat(30),
};

const MVS_EXPECTED = [
  "identidade_mini.txt",
  "eco_estrutura_de_resposta.txt",
  "usomemorias.txt",
  "bloco_tecnico_memoria.txt",
  "metodo_viva_enxuto.txt",
];

test("ContextBuilder mantém MVS e respeita orçamento aditivo", async () => {
  const originalBudget = process.env.ECO_KNAPSACK_BUDGET_TOKENS;
  process.env.ECO_KNAPSACK_BUDGET_TOKENS = "100";

  qualityAnalyticsStore.reset();
  ModuleStore.configure([]);
  ModuleStore.invalidate();

  for (const [name, content] of Object.entries(inlineModules)) {
    ModuleStore.registerInline(name, content);
  }

  qualityAnalyticsStore.recordModuleOutcome("LINGUAGEM_NATURAL.txt", {
    q: 0.9,
    tokens: ModuleStore.tokenCountOf("LINGUAGEM_NATURAL.txt", inlineModules["LINGUAGEM_NATURAL.txt"]!),
  });
  qualityAnalyticsStore.recordModuleOutcome("ENCERRAMENTO_SENSIVEL.txt", {
    q: 0.4,
    tokens: ModuleStore.tokenCountOf("ENCERRAMENTO_SENSIVEL.txt", inlineModules["ENCERRAMENTO_SENSIVEL.txt"]!),
  });

  const decision = computeEcoDecision(
    "Estou refletindo bastante e quero um mergulho profundo na conversa"
  );

  try {
    decision.intensity = 6;
    decision.openness = 2;
    decision.vivaSteps = ["V", "I", "A"];
    decision.saveMemory = true;
    decision.hasTechBlock = true;

    await montarContextoEco({
      texto: "Quero explorar com calma",
      mems: [],
      decision,
    });

    const selected = decision.debug.selectedModules;
    for (const required of MVS_EXPECTED) {
      assert.ok(
        selected.includes(required),
        `esperava módulo ${required} presente no MVS`
      );
    }

    const knapsack = decision.debug.knapsack;
    assert.ok(knapsack, "esperava dados de knapsack no debug");
    if (knapsack) {
      assert.equal(knapsack.budget, 100);
      assert.ok(
        knapsack.adotados.length > 0,
        "esperava pelo menos um módulo aditivo escolhido via knapsack"
      );
      assert.ok(
        knapsack.tokensAditivos <= 100,
        `tokens aditivos (${knapsack.tokensAditivos}) devem respeitar budget`
      );
    }
  } finally {
    qualityAnalyticsStore.reset();
    ModuleStore.invalidate();
    if (originalBudget === undefined) {
      delete process.env.ECO_KNAPSACK_BUDGET_TOKENS;
    } else {
      process.env.ECO_KNAPSACK_BUDGET_TOKENS = originalBudget;
    }
  }
});
