/**
 * promptMarkers.ts — Marcadores de proveniência do system prompt da Eco.
 *
 * Cada marcador mapeia um BLOCO-FONTE (de onde o conteúdo vem) para um trecho de CORPO único e
 * estável que prova a presença daquele bloco no prompt montado. Usado por:
 *   - `server/scripts/dumpPrompt.ts` (inspeção manual)
 *   - golden tests de contrato (`server/tests/promptContext/promptContract.golden.test.ts`)
 *
 * Regra: evite usar TÍTULOS como needle — o `dedupeBySection` do stitcher pode remover títulos
 * mantendo o corpo. Prefira uma frase do corpo.
 */

export interface SourceMarker {
  source: string;
  needle: string;
}

export const SOURCE_MARKERS: SourceMarker[] = [
  { source: "promptIdentity.ts → ID_ECO_CORE", needle: "Exploradora de Conhecimento Ontológico" },
  { source: "promptIdentity.ts → ECO_VOICE", needle: "PROIBIÇÕES LINGUÍSTICAS" },
  { source: "promptIdentity.ts → MEMORY_PROTOCOL", needle: "MEMÓRIA E CONTINUIDADE" },
  { source: "promptIdentity.ts → SAFETY_PROTOCOL", needle: "SEGURANÇA E LIMITES" },
  { source: "developer_prompt.txt", needle: "Missão Fundamental" },
  { source: "formato_resposta.txt", needle: "Espelho de Terceira Ordem" },
  { source: "instrucoes_sistema.txt", needle: "Zona proximal de desenvolvimento" },
  { source: "sistema_identidade.txt (dropado pelo stitcher)", needle: "Persona Operacional" },
  { source: "usomemorias.txt", needle: "Continuidade Discreta" },
  { source: "abertura_superficie.txt (NV1)", needle: "Espelho-Flash" },
  { source: "nv2_reflexao_core.txt (NV2)", needle: "Movimento Quádruplo" },
  { source: "nv3_profundo_core.txt (NV3)", needle: "Movimento Quíntuplo" },
  { source: "metodo_viva_enxuto.txt", needle: "VIVA" },
  { source: "bloco MEMÓRIAS PERTINENTES (contextSectionsBuilder)", needle: "MEMÓRIAS PERTINENTES" },
  // Lente temática (lenses/index.ts → IDENTIDADE_TRANSICAO), gate por tema em NV2/NV3:
  { source: "lenses → IDENTIDADE_TRANSICAO", needle: "pergunta mais silenciosa" },
];

/** Verifica se um trecho-needle está presente no prompt. */
export function needlePresent(prompt: string, needle: string): boolean {
  return prompt.includes(needle);
}

/** Lista as fontes presentes no prompt (útil para auditoria viva×morta). */
export function presentSources(prompt: string): SourceMarker[] {
  return SOURCE_MARKERS.filter((m) => prompt.includes(m.needle));
}
