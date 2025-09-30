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

export type PromptComposerBaseInput = Omit<PromptComposerInput, "texto">;

export const CURRENT_MESSAGE_PLACEHOLDER = "__ECO_MENSAGEM_ATUAL__";

export function composePromptBase({
  nivel,
  memCount,
  forcarMetodoViva,
  extras,
  stitched,
  memRecallBlock = "",
  instructionText,
}: PromptComposerBaseInput): string {
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
    `Mensagem atual: ${CURRENT_MESSAGE_PLACEHOLDER}`,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function applyCurrentMessage(base: string, texto: string): string {
  return base.replace(CURRENT_MESSAGE_PLACEHOLDER, texto);
}

export function composePrompt(input: PromptComposerInput): string {
  const base = composePromptBase(input);
  return applyCurrentMessage(base, input.texto);
}
