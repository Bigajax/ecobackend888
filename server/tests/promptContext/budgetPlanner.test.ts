import test from "node:test";
import assert from "node:assert/strict";

import { planAndStitch } from "../../services/promptContext/selection/budgetPlanner";
import type { EcoDecisionResult } from "../../services/conversation/ecoDecisionHub";

test("planAndStitch keeps module metadata intact", () => {
  const ecoDecision = {
    debug: {},
    saveMemory: false,
    hasTechBlock: false,
  } as unknown as EcoDecisionResult;

  const regularModules = [
    { name: "modA", text: "A", meta: { order: 1 } },
    { name: "modB", text: "B", meta: { order: 2 } },
  ];

  const filteredModulesWithTokens = [
    { name: "modA", text: "A", tokens: 10, meta: { order: 1 }, hadContent: true },
    { name: "modB", text: "B", tokens: 15, meta: { order: 2 }, hadContent: true },
  ];

  const result = planAndStitch({
    orderedAllowed: ["modA", "modB"],
    filteredModulesWithTokens,
    pinned: [],
    debugMap: new Map(),
    tokenLookup: new Map([
      ["modA", 10],
      ["modB", 15],
    ]),
    adoptedSet: new Set(["modA", "modB"]),
    knapsackBudget: 50,
    knapsackResult: { adotados: ["modA", "modB"], marginalGain: 2 },
    regularModules,
    footerModules: [],
    nivel: 2,
    ecoDecision,
  });

  assert.equal(result.finalRegular.length, 2);
  assert.equal(result.finalRegular[0].meta.order, 1);
  assert.equal(result.finalRegular[1].meta.order, 2);
  assert.equal(result.tokensAditivos, 25);
  assert.ok(Array.isArray(result.reduced));
  assert.equal(ecoDecision.debug.knapsack?.tokensAditivos, 25);
});
