import test from "node:test";
import assert from "node:assert/strict";

import montarContextoEco from "../../services/promptContext/ContextBuilder";
import { ModuleStore } from "../../services/promptContext/ModuleStore";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";
import { selectBanditArms } from "../../services/conversation/promptPlan";
import { qualityAnalyticsStore } from "../../services/analytics/analyticsStore";
import { updateArm } from "../../services/orchestrator/bandits/ts";

const inlineModules: Record<string, string> = {
  "developer_prompt.txt": "DP".repeat(20),
  "IDENTIDADE.txt": "ID".repeat(200),
  "identidade_mini.txt": "IM".repeat(40),
  "MODULACAO_TOM_REGISTRO.txt": "MT".repeat(40),
  "MODULACAO_TOM_REGISTRO_full.txt": "MTF".repeat(40),
  "MODULACAO_TOM_REGISTRO_mini.txt": "MTM".repeat(40),
  "MODULACAO_TOM_REGISTRO_rules.txt": "MTR".repeat(40),
  "LINGUAGEM_NATURAL.txt": "LN".repeat(40),
  "LINGUAGEM_NATURAL_full.txt": "LNF".repeat(40),
  "LINGUAGEM_NATURAL_mini.txt": "LNM".repeat(40),
  "LINGUAGEM_NATURAL_rules.txt": "LNR".repeat(40),
  "ENCERRAMENTO_SENSIVEL.txt": "ES".repeat(30),
  "ENCERRAMENTO_SENSIVEL_full.txt": "ESF".repeat(30),
  "ENCERRAMENTO_SENSIVEL_mini.txt": "ESM".repeat(30),
  "ENCERRAMENTO_SENSIVEL_rules.txt": "ESR".repeat(30),
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

test("bandit picks propagam variantes no contexto", async () => {
  const originalBudget = process.env.ECO_KNAPSACK_BUDGET_TOKENS;
  const originalRandom = Math.random;
  process.env.ECO_KNAPSACK_BUDGET_TOKENS = "2000";
  Math.random = () => 0.5;

  qualityAnalyticsStore.reset();
  ModuleStore.configure([]);
  ModuleStore.invalidate();

  for (const [name, content] of Object.entries(inlineModules)) {
    ModuleStore.registerInline(name, content);
  }

  for (let i = 0; i < 25; i += 1) {
    updateArm("Linguagem", "_rules", 0.9);
    updateArm("Linguagem", "_mini", 0.1);
    updateArm("Encerramento", "_mini", 0.8);
    updateArm("Encerramento", "_full", 0.2);
    updateArm("Modulacao", "_full", 0.7);
    updateArm("Modulacao", "_rules", 0.3);
  }

  const decision = computeEcoDecision("Quero aprofundar");
  decision.intensity = 6;
  decision.openness = 2;
  decision.vivaSteps = ["V", "I", "A"];
  decision.saveMemory = true;
  decision.hasTechBlock = true;

  const picks = selectBanditArms({
    decision,
    distinctId: "bandit-test",
    userId: "user-123",
  });

  assert.equal(picks.Linguagem?.arm, "_rules");
  assert.equal(picks.Encerramento?.arm, "_mini");
  assert.equal(picks.Modulacao?.arm, "_full");

  try {
    await montarContextoEco({
      texto: "Vamos conversar com calma",
      mems: [],
      decision,
    });

    const moduleIds = decision.debug.modules.map((entry) => entry.id);
    assert.ok(
      moduleIds.includes(picks.Linguagem!.module),
      "variante de linguagem deve estar registrada no debug"
    );
    assert.ok(
      moduleIds.includes(picks.Encerramento!.module),
      "variante de encerramento deve estar registrada no debug"
    );
    assert.ok(
      moduleIds.includes(picks.Modulacao!.module),
      "variante de modulação deve estar registrada no debug"
    );

    assert.equal(decision.debug.bandits?.Linguagem?.module, picks.Linguagem!.module);
    assert.equal(decision.banditArms?.Encerramento?.module, picks.Encerramento!.module);
    assert.equal(decision.banditArms?.Modulacao?.module, picks.Modulacao!.module);
  } finally {
    qualityAnalyticsStore.reset();
    ModuleStore.invalidate();
    Math.random = originalRandom;
    if (originalBudget === undefined) {
      delete process.env.ECO_KNAPSACK_BUDGET_TOKENS;
    } else {
      process.env.ECO_KNAPSACK_BUDGET_TOKENS = originalBudget;
    }
  }
});
