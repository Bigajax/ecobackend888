import test, { before } from "node:test";
import assert from "node:assert/strict";

import { ModuleCatalog } from "../../services/promptContext/moduleCatalog";
import { Selector } from "../../services/promptContext/Selector";
import type { DecSnapshot } from "../../services/promptContext/Selector";

before(async () => {
  await ModuleCatalog.ensureReady();
});

function makeDec(overrides: Partial<DecSnapshot> = {}): DecSnapshot {
  const baseFlags = Selector.derivarFlags("", {});
  return {
    intensity: 5,
    openness: 2,
    isVulnerable: false,
    vivaSteps: ["V", "A"],
    saveMemory: false,
    hasTechBlock: false,
    tags: [],
    domain: null,
    flags: baseFlags,
    ...overrides,
  };
}

test("applyModuleMetadata respeita abertura", async () => {
  const baseOrder = ["abertura_superficie.txt", "ENCERRAMENTO_SENSIVEL.txt"];
  const candidates = await ModuleCatalog.load(baseOrder);

  const decNv1 = makeDec({ openness: 1, intensity: 3, vivaSteps: ["V", "A"] });
  const resultNv1 = Selector.applyModuleMetadata({ dec: decNv1, baseOrder, candidates });
  assert.ok(resultNv1.regular.some((module) => module.name === "abertura_superficie.txt"));
  assert.ok(!resultNv1.footers.some((module) => module.name === "ENCERRAMENTO_SENSIVEL.txt"));

  const decNv3 = makeDec({
    openness: 3,
    intensity: 8,
    isVulnerable: true,
    vivaSteps: ["V", "I", "V", "A", "Pausa"],
  });
  decNv3.flags.crise = false;
  const resultNv3 = Selector.applyModuleMetadata({ dec: decNv3, baseOrder, candidates });
  assert.ok(resultNv3.footers.some((module) => module.name === "ENCERRAMENTO_SENSIVEL.txt"));
});

test("inclui BLOCO_TECNICO_MEMORIA quando intensidade alta e hasTechBlock", async () => {
  const baseOrder = ["tecnico_bloco_memoria.txt"];
  const candidates = await ModuleCatalog.load(baseOrder);

  const decLow = makeDec({ intensity: 6, hasTechBlock: false, openness: 2 });
  const resultLow = Selector.applyModuleMetadata({ dec: decLow, baseOrder, candidates });
  assert.strictEqual(resultLow.footers.length, 0);

  const decHigh = makeDec({
    intensity: 8,
    hasTechBlock: true,
    openness: 3,
    vivaSteps: ["V", "I", "V", "A", "Pausa"],
    isVulnerable: true,
  });
  const resultHigh = Selector.applyModuleMetadata({ dec: decHigh, baseOrder, candidates });
  assert.ok(resultHigh.footers.some((module) => module.name === "tecnico_bloco_memoria.txt"));
});

test("flags de crise ativam DETECÇÃOCRISE", async () => {
  const baseOrder = ["DETECÇÃOCRISE.txt"];
  const candidates = await ModuleCatalog.load(baseOrder);

  const decCrisis = makeDec({
    intensity: 9,
    openness: 3,
    isVulnerable: true,
    vivaSteps: ["V", "I", "V", "A", "Pausa"],
  });
  decCrisis.flags.crise = true;
  const result = Selector.applyModuleMetadata({ dec: decCrisis, baseOrder, candidates });
  assert.ok(result.footers.some((module) => module.name === "DETECÇÃOCRISE.txt"));
});

test("placeholders {{DEC.*}} são interpolados", async () => {
  const baseOrder = ["metodo_viva_enxuto.txt"];
  const candidates = await ModuleCatalog.load(baseOrder);

  const dec = makeDec({
    openness: 2,
    vivaSteps: ["V", "I", "A"],
    tags: ["lembranca"],
    saveMemory: true,
  });
  const result = Selector.applyModuleMetadata({ dec, baseOrder, candidates });
  assert.ok(result.regular.length > 0);
  const texto = result.regular[0].text;
  assert.ok(!texto.includes("{{DEC"));
  assert.match(texto, /VIVA/);
});
