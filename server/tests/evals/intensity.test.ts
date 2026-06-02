/**
 * intensity.test.ts — Onda 3 (offline): trava a calibração de `estimarIntensidade0a10` contra um
 * dataset rotulado. Determinístico, sem API. `npm run test:node`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { estimarIntensidade0a10 } from "../../services/promptContext/flags";
import { INTENSITY_CASES } from "../../evals/intensityDataset";

test("[intensidade] todos os casos do dataset caem na banda esperada", () => {
  const falhas: string[] = [];
  for (const c of INTENSITY_CASES) {
    const v = estimarIntensidade0a10(c.texto);
    if (v < c.min || v > c.max) {
      falhas.push(`"${c.texto}" → ${v} (esperado ${c.banda} [${c.min}-${c.max}]${c.nota ? ` — ${c.nota}` : ""})`);
    }
  }
  assert.equal(falhas.length, 0, `casos fora da banda:\n${falhas.join("\n")}`);
});

test("[intensidade] invariantes de SEGURANÇA: crise e luto são sempre altos (≥7)", () => {
  for (const texto of [
    "penso em me matar",
    "não quero mais viver",
    "queria acabar com tudo",
    "minha mãe faleceu semana passada",
    "estou de luto",
  ]) {
    assert.ok(
      estimarIntensidade0a10(texto) >= 7,
      `crise/luto deveria ser ≥7: "${texto}" → ${estimarIntensidade0a10(texto)}`
    );
  }
});

test("[intensidade] sem falso-positivo: 'perdi' genérico não vira alta", () => {
  assert.ok(estimarIntensidade0a10("perdi minha chave de casa") < 7);
  assert.ok(estimarIntensidade0a10("perdi o ônibus hoje de manhã") < 7);
});

test("[intensidade] neutro/prático fica abaixo do limiar de memória (<7)", () => {
  for (const texto of ["oi, tudo bem?", "como funciona o sistema?", "me dá um passo a passo"]) {
    assert.ok(estimarIntensidade0a10(texto) < 7, `deveria ser <7: "${texto}"`);
  }
});
