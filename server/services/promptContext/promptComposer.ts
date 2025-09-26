export type PromptComposerInput = {
  nivel: 1 | 2 | 3;
  memCount: number;
  forcarMetodoViva: boolean;
  extras: string[];
  stitched: string;
  memRecallBlock?: string;
  instructionText: string;
  texto: string;
};

export function composePrompt({
  nivel,
  memCount,
  forcarMetodoViva,
  extras,
  stitched,
  memRecallBlock = "",
  instructionText,
  texto,
}: PromptComposerInput): string {
  const header = [
    `Nível de abertura: ${nivel}`,
    memCount > 0 ? `Memórias (internas): ${memCount} itens` : `Memórias: none`,
    forcarMetodoViva ? "Forçar VIVA: sim" : "Forçar VIVA: não",
  ].join(" | ");

  const extrasBlock = extras.length
    ? `\n\n${extras.map((entry) => `• ${entry}`).join("\n")}`
    : "";

  return [
    `// CONTEXTO ECO — NV${nivel}`,
    `// ${header}${extrasBlock}`,
    "",
    stitched,
    "",
    memRecallBlock || "",
    "",
    instructionText,
    "",
    `Mensagem atual: ${texto}`,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}
