import test from "node:test";
import assert from "node:assert/strict";

import montarContextoEco from "../../services/promptContext/ContextBuilder";
import { ModuleStore } from "../../services/promptContext/ModuleStore";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";
import { qualityAnalyticsStore } from "../../services/analytics/analyticsStore";

const inlineModules: Record<string, string> = {
  "DEVELOPER_PROMPT.txt": "DP".repeat(20),
  "IDENTIDADE.txt": "ID".repeat(200),
  "IDENTIDADE_MINI.txt": "IM".repeat(40),
  "MODULACAO_TOM_REGISTRO.txt": "MT".repeat(40),
  "LINGUAGEM_NATURAL.txt": "LN".repeat(40),
  "ENCERRAMENTO_SENSIVEL.txt": "ES".repeat(30),
  "DETECÇÃOCRISE.txt": "DC".repeat(30),
  "PEDIDOPRÁTICO.txt": "PP".repeat(30),
  "ESCALA_ABERTURA_1a3.txt": "EA".repeat(40),
  "ESCALA_INTENSIDADE_0a10.txt": "EI".repeat(40),
  "METODO_VIVA_ENXUTO.txt": "MV".repeat(50),
  "BLOCO_TECNICO_MEMORIA.txt": "BT".repeat(40),
  "USOMEMÓRIAS.txt": "UM".repeat(40),
  "PRINCIPIOS_CHAVE.txt": "PC".repeat(60),
  "ANTISALDO_MIN.txt": "AM".repeat(30),
  "ECO_ESTRUTURA_DE_RESPOSTA.txt": "EE".repeat(60),
  "NV1_CORE.txt": "NV".repeat(30),
};

const MVS_EXPECTED = [
  "IDENTIDADE_MINI.txt",
  "ECO_ESTRUTURA_DE_RESPOSTA.txt",
  "USOMEMÓRIAS.txt",
  "BLOCO_TECNICO_MEMORIA.txt",
  "METODO_VIVA_ENXUTO.txt",
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
