export type InstructionBlock = { title: string; body: string };

const RESPONSE_PLAN =
  "Fluxo: acolher (1 linha) • espelhar o núcleo (1 linha) • (opcional) uma impressão curta com permissão • máx. 1 pergunta viva • fechar leve.";

const FINAL_INSTRUCTIONS =
  "Ética: sem diagnósticos nem promessas de cura. Priorize autonomia, cuidado e ritmo. Se tema clínico/urgente, acolha e oriente apoio adequado.";

export function buildInstructionBlocks(nivel: 1 | 2 | 3): InstructionBlock[] {
  if (nivel === 1) {
    return [{ title: "ECO_INSTRUCOES_FINAIS", body: FINAL_INSTRUCTIONS }];
  }

  return [
    { title: "ECO_RESPONSE_PLAN", body: RESPONSE_PLAN },
    { title: "ECO_INSTRUCOES_FINAIS", body: FINAL_INSTRUCTIONS },
  ];
}

export function renderInstructionBlocks(blocks: InstructionBlock[]): string {
  return blocks
    .map((block) => `### ${block.title}\n${block.body}`.trim())
    .join("\n\n");
}
