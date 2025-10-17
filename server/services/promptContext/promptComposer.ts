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
  prelude?: string;
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
  prelude,
}: PromptComposerBaseInput): string {
  const header = [
    `Nível de abertura: ${nivel}`,
    memCount > 0 ? `Memórias (internas): ${memCount} itens` : `Memórias: none`,
    forcarMetodoViva ? "Forçar VIVA: sim" : "Forçar VIVA: não",
  ].join(" | ");

  const extrasBlock = extras.length
    ? `\n\n${extras.map((entry) => `• ${entry.trim()}`).filter((entry) => entry.length > 0).join("\n")}`
    : "";

  const cleanedFooter = typeof footer === "string" ? footer.trim() : "";
  const cleanedMemRecall = typeof memRecallBlock === "string" ? memRecallBlock.trim() : "";
  const cleanedInstructions = instructionText.trim();
  const cleanedDec = typeof decBlock === "string" ? decBlock.trim() : "";
  const cleanedStitched = stitched.trim();

  const segments: string[] = [];

  const cleanedPrelude = typeof prelude === "string" ? prelude.trim() : "";
  if (cleanedPrelude.length > 0) {
    segments.push(cleanedPrelude);
  }

  const headerBlock = [`// CONTEXTO ECO — NV${nivel}`, `// ${header}${extrasBlock}`]
    .map((segment) => segment.trim())
    .join("\n")
    .trim();

  segments.push(headerBlock);

  const tailSegments = [
    cleanedDec,
    cleanedStitched,
    cleanedMemRecall,
    cleanedInstructions,
    cleanedFooter,
    `Mensagem atual: ${CURRENT_MESSAGE_PLACEHOLDER}`,
  ].filter((segment) => segment.length > 0);

  segments.push(...tailSegments);

  return segments.join("\n\n").trim();
}

export function applyCurrentMessage(base: string, texto: string): string {
  return base.replace(CURRENT_MESSAGE_PLACEHOLDER, texto);
}

export function composePrompt(input: PromptComposerInput): string {
  const base = composePromptBase(input);
  return applyCurrentMessage(base, input.texto);
}
