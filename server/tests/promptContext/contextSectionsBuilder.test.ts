import test from "node:test";
import assert from "node:assert/strict";

import { buildContextSections } from "../../services/promptContext/composition/contextSectionsBuilder";
import type { SimilarMemory } from "../../services/promptContext/contextTypes";

const baseParams = {
  texto: "Estou triste de novo essa semana",
  nomeUsuario: null,
  hasContinuity: false,
  aberturaHibrida: null,
  derivados: null,
  nivel: 2 as const,
};

test("ativa o bloco MEMÓRIAS PERTINENTES a partir das memórias recuperadas (memsSemelhantesNorm), mesmo sem o caminho recall", () => {
  const retrieved: SimilarMemory[] = [
    {
      resumo_eco: "Perdi meu emprego e me senti perdido.",
      similarity: 0.83,
      tags: ["trabalho", "perda"],
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      dominio_vida: "trabalho",
    },
  ];

  const result = buildContextSections({
    ...baseParams,
    // Cenário de produção: recall vazio, memórias chegam em memsSemelhantesNorm
    hasMemories: false,
    mems: [],
    memsSemelhantesNorm: retrieved,
  });

  const joined = result.contextSections.join("\n");
  assert.ok(joined.includes("MEMÓRIAS PERTINENTES"));
  assert.ok(joined.includes("Perdi meu emprego"));
  assert.ok(joined.includes("há 3 dias"));
  assert.ok(joined.includes("trabalho, perda"));

  // A instrução de abertura usando as memórias deve estar presente
  assert.ok(result.extras.some((e) => e.includes("MEMÓRIAS PERTINENTES")));
});

test("não emite bloco de memórias quando não há memórias recuperadas", () => {
  const result = buildContextSections({
    ...baseParams,
    texto: "Você lembra do que conversamos antes?",
    hasMemories: false,
    mems: [],
    memsSemelhantesNorm: [],
  });

  const joined = result.contextSections.join("\n");
  assert.ok(!joined.includes("MEMÓRIAS PERTINENTES"));
  // Quando o usuário pergunta sobre memória e não há nenhuma, deve orientar a dizer que não encontrou
  assert.ok(result.extras.some((e) => e.includes("não encontrou memórias relacionadas")));
});
