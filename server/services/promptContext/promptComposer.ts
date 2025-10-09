export type PromptComposerInput = {
  nivel: 1 | 2 | 3;
  memCount: number;
  forcarMetodoViva: boolean;
  extras: string[];
  stitched: string;
  footer?: string;
  memRecallBlock?: string;
  instructionText: string;
  decBlock?: string;
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
  footer,
  memRecallBlock = "",
  instructionText,
  decBlock,
}: PromptComposerBaseInput): string {
  const header = [
    `Nível de abertura: ${nivel}`,
    memCount > 0 ? `Memórias (internas): ${memCount} itens` : `Memórias: none`,
    forcarMetodoViva ? "Forçar VIVA: sim" : "Forçar VIVA: não",
  ].join(" | ");

  const extrasBlock = extras.length
    ? `\n\n${extras.map((entry) => `• ${entry}`).join("\n")}`
    : "";

  const parts = [
    `// CONTEXTO ECO — NV${nivel}`,
    `// ${header}${extrasBlock}`,
    "",
    ...(decBlock ? [decBlock, ""] : []),
    stitched,
    "",
    memRecallBlock || "",
    "",
    instructionText,
    "",
    ...(footer ? [footer, ""] : []),
    `Mensagem atual: ${CURRENT_MESSAGE_PLACEHOLDER}`,
  ];

  return parts
    .filter((segment) => typeof segment === "string" && segment.length > 0)
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
