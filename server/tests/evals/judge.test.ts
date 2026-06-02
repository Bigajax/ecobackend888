/** Testa a lógica pura do juiz (parsing), sem API. `npm run test:node`. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseJudgeVerdict, extractJsonObject, DEFAULT_CRITERIA, PASS_THRESHOLD } from "../../evals/judge";

test("[eval] extractJsonObject tolera cercas ```json e ruído", () => {
  const raw = 'blá blá\n```json\n{"scores": {"a": 1}}\n```\nfim';
  assert.equal(extractJsonObject(raw), '{"scores": {"a": 1}}');
});

test("[eval] parseJudgeVerdict computa overall e pass por critério", () => {
  const criterios = DEFAULT_CRITERIA;
  const scoresObj = Object.fromEntries(
    criterios.map((k, i) => [k, { nota: i === 0 ? 0.4 : 0.8, justificativa: `j${i}` }])
  );
  const raw = JSON.stringify({ scores: scoresObj });
  const verdict = parseJudgeVerdict(raw, criterios);

  assert.equal(verdict.scores.length, criterios.length);
  // primeiro critério 0.4 -> abaixo do threshold -> pass false
  assert.equal(verdict.scores[0].nota, 0.4);
  assert.equal(verdict.scores[0].pass, 0.4 >= PASS_THRESHOLD);
  assert.equal(verdict.scores[1].pass, true);
  const esperadoOverall =
    verdict.scores.reduce((a, s) => a + s.nota, 0) / verdict.scores.length;
  assert.ok(Math.abs(verdict.overall - esperadoOverall) < 1e-9);
});

test("[eval] parseJudgeVerdict clampa nota fora de [0,1]", () => {
  const criterios = ["sem_cliche"] as const;
  const raw = JSON.stringify({ scores: { sem_cliche: { nota: 1.7, justificativa: "x" } } });
  const verdict = parseJudgeVerdict(raw, criterios as any);
  assert.equal(verdict.scores[0].nota, 1);
});

test("[eval] parseJudgeVerdict lança quando falta critério", () => {
  const raw = JSON.stringify({ scores: { sem_cliche: { nota: 0.8 } } });
  assert.throws(() => parseJudgeVerdict(raw, ["sem_cliche", "seguranca"] as any));
});
