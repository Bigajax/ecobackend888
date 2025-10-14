import test from "node:test";
import assert from "node:assert";

import { planHints } from "../../core/ResponsePlanner";
import { materializeHints } from "../../core/ResponseGenerator";

test("planHints identifica ansiedade e retorna metadados", () => {
  const hints = planHints("estou muito ansiosa com tudo");

  assert.ok(hints, "deve produzir hints");
  assert.strictEqual(hints?.key, "ansiedade");
  assert.ok(hints!.score >= 0.6, "score deve ser relevante");
  assert.ok(hints!.flags.includes("needs_grounding"));
});

test("materializeHints gera instruções curtas a partir do plano", () => {
  const hints = planHints("andando muito cansado e sem energia")!;
  const materialized = materializeHints(hints, "andando muito cansado e sem energia");

  assert.ok(materialized?.soft_opening);
  assert.ok(materialized?.mirror_suggestion?.includes("sem energia"));
  assert.strictEqual(materialized?.key, "cansaco");
});
