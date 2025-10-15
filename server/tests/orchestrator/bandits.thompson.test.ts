import test from "node:test";
import assert from "node:assert/strict";

import {
  pickArm,
  updateArm,
} from "../../services/orchestrator/bandits/ts";
import { qualityAnalyticsStore } from "../../services/analytics/analyticsStore";

test("pickArm favorece braço com sinal forte", () => {
  qualityAnalyticsStore.reset();
  const originalRandom = Math.random;
  Math.random = () => 0.5;

  for (let i = 0; i < 20; i += 1) {
    updateArm("Linguagem", "_full", 0.8);
    updateArm("Linguagem", "_mini", 0.2);
    updateArm("Linguagem", "_rules", 0.1);
  }

  const arm = pickArm("Linguagem");
  assert.equal(arm, "_full");

  Math.random = originalRandom;
});

test("updateArm registra posterior utilizável", () => {
  qualityAnalyticsStore.reset();
  updateArm("Encerramento", "_rules", 0.6);

  const posterior = qualityAnalyticsStore.getBanditPosterior("Encerramento", "_rules");
  assert.equal(posterior.count, 1);
  assert.ok(posterior.alpha > 1);
  assert.ok(posterior.beta > 1);
});
