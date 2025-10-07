import test from "node:test";
import assert from "node:assert";

import { planCuriousFallback } from "../../core/ResponsePlanner";

test("planCuriousFallback cria plano temático quando há pistas emocionais", () => {
  const { text, plan } = planCuriousFallback("estou muito ansiosa com tudo");

  assert.ok(text.includes("ansiedade"), "texto menciona ansiedade");
  assert.strictEqual(plan.theme, "ansiedade");
  assert.ok(plan.acknowledgement.length > 0);
  assert.ok(plan.exploration.length > 0);
  assert.ok(plan.invitation.length > 0);
});

test("planCuriousFallback usa plano padrão quando não encontra tema", () => {
  const { text, plan } = planCuriousFallback("oi");

  assert.strictEqual(plan.theme, undefined);
  assert.strictEqual(plan.priority, 4);
  assert.ok(text.includes("Estou aqui, presente"));
});
