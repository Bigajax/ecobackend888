/**
 * activationTracer.summary.test.ts — Onda 4 (observabilidade).
 * Verifica que o resumo do trace reflete decisão/lentes/memória/latência. `npm run test:node`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ActivationTracer } from "../../core/activationTracer";

test("[trace] summary reflete decisão, lentes, módulos e memória", () => {
  const t = new ActivationTracer({ userId: "u-1", startedAt: Date.now() - 50 });
  t.setModel("anthropic/claude-sonnet-4.6");
  t.mergeMetadata({
    decision: { openness: 3, intensity: 8, isVulnerable: true, crisis: false, ideacao: false },
    selectionMode: "deterministic",
    lenses: ["IDENTIDADE_TRANSICAO"],
    memoria: { pertinentes: 2 },
  });
  t.addModule("developer_prompt.txt", "pinned", "selected");
  t.addModule("metodo_viva_enxuto.txt", "mvs", "selected");
  t.setMemoryDecision(true, 8, "intensidade>=7");
  t.markTotal();

  const s = t.summary();
  assert.equal(s.tag, "request_trace");
  assert.equal(s.userId, "u-1");
  assert.equal(s.openness, 3);
  assert.equal(s.intensity, 8);
  assert.equal(s.vulnerable, true);
  assert.equal(s.selectionMode, "deterministic");
  assert.deepEqual(s.lenses, ["IDENTIDADE_TRANSICAO"]);
  assert.equal(s.memPertinentes, 2);
  assert.equal(s.modulesCount, 2);
  assert.equal(s.memoryWillSave, true);
  assert.equal(typeof s.latencyMs, "number");
  assert.ok((s.latencyMs as number) >= 0);
});

test("[trace] summary tem defaults seguros quando não há metadata", () => {
  const t = new ActivationTracer();
  const s = t.summary();
  assert.equal(s.openness, null);
  assert.deepEqual(s.lenses, []);
  assert.equal(s.modulesCount, 0);
  assert.equal(s.memoryWillSave, null);
});

test("[trace] markTotal é idempotente (não sobrescreve latência)", () => {
  const t = new ActivationTracer({ startedAt: Date.now() - 30 });
  t.markTotal();
  const first = t.summary().latencyMs as number;
  t.markTotal();
  assert.equal(t.summary().latencyMs, first);
});
