import test from "node:test";
import assert from "node:assert/strict";

import { solveKnapsack } from "../../services/orchestrator/knapsack";

test("solveKnapsack respeita orçamento e prioriza VPT ajustado", () => {
  const result = solveKnapsack(600, [
    { id: "identidade_full", tokens: 300, priorPeso: 1, vptMean: 0.008 },
    { id: "encerramento_rules", tokens: 500, priorPeso: 3, vptMean: 0.01 },
    { id: "linguagem_mini", tokens: 200, priorPeso: 2, vptMean: 0.006 },
  ]);

  assert.deepEqual(result.adotados, ["identidade_full", "linguagem_mini"]);
  assert.equal(result.marginalGain, 3.6);
});

test("solveKnapsack desempata por menor custo quando score é igual", () => {
  const result = solveKnapsack(250, [
    { id: "A", tokens: 140, priorPeso: 2, vptMean: 0.004 },
    { id: "B", tokens: 120, priorPeso: 2, vptMean: 0.004 },
    { id: "C", tokens: 90, priorPeso: 4, vptMean: 0.002 },
  ]);

  assert.deepEqual(result.adotados, ["B", "C"]);
  assert.ok(result.marginalGain > 0);
});
