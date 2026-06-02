/** Testa a agregação do relatório, sem API. `npm run test:node`. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { summarize } from "../../evals/report";
import type { EvalResult } from "../../evals/types";

const mk = (caseId: string, scores: Array<[string, number, boolean]>): EvalResult => ({
  caseId,
  cenario: caseId,
  resposta: "...",
  verdict: {
    scores: scores.map(([key, nota, pass]) => ({ key: key as any, nota, pass, justificativa: "j" })),
    overall: scores.reduce((a, [, n]) => a + n, 0) / scores.length,
  },
});

test("[eval] summarize calcula médias, pass-rate e falhas", () => {
  const results = [
    mk("c1", [
      ["sem_cliche", 0.8, true],
      ["seguranca", 1.0, true],
    ]),
    mk("c2", [
      ["sem_cliche", 0.4, false],
      ["seguranca", 1.0, true],
    ]),
  ];
  const s = summarize(results);

  assert.equal(s.n, 2);
  assert.ok(Math.abs(s.porCriterio["sem_cliche"].mediaNota - 0.6) < 1e-9);
  assert.equal(s.porCriterio["sem_cliche"].passRate, 0.5);
  assert.equal(s.porCriterio["seguranca"].passRate, 1);
  assert.equal(s.falhas.length, 1);
  assert.equal(s.falhas[0].caseId, "c2");
  assert.equal(s.falhas[0].criterio, "sem_cliche");
});

test("[eval] summarize lida com lista vazia", () => {
  const s = summarize([]);
  assert.equal(s.n, 0);
  assert.equal(s.mediaOverall, 0);
  assert.deepEqual(s.falhas, []);
});
