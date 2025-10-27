import { composePromptBase, applyCurrentMessage } from "../promptComposer";
import { buildContinuityModuleText, buildContinuityPromptLine } from "../pipeline/continuityResolver";

export interface PromptAssemblyParams {
  nivel: 1 | 2 | 3;
  memCount: number;
  forcarMetodoViva: boolean;
  extras: string[];
  stitched: string;
  footerText: string;
  instructionText: string;
  decBlock: string;
  hasContinuity: boolean;
  continuityRef: unknown;
  contextSections: string[];
  identitySections: string[];
  staticSections: string[];
  texto: string;
}

export interface PromptAssemblyResult {
  base: string;
  promptWithText: string;
}

export function assemblePrompt({
  nivel,
  memCount,
  forcarMetodoViva,
  extras,
  stitched,
  footerText,
  instructionText,
  decBlock,
  hasContinuity,
  continuityRef,
  contextSections,
  identitySections,
  staticSections,
  texto,
}: PromptAssemblyParams): PromptAssemblyResult {
  const continuityPrelude = hasContinuity
    ? [
        buildContinuityPromptLine(continuityRef),
        buildContinuityModuleText(continuityRef).trim(),
      ]
        .filter((part) => part && part.length > 0)
        .join("\n\n")
    : "";

  const promptCoreBase = composePromptBase({
    nivel,
    memCount,
    forcarMetodoViva,
    extras,
    stitched,
    footer: footerText,
    instructionText,
    decBlock,
    prelude: continuityPrelude || undefined,
  });

  const baseSections = [
    promptCoreBase.trim(),
    ...identitySections,
    ...staticSections,
  ].filter((section) => section.length > 0);

  const combinedSections = [...contextSections, ...baseSections];
  const base = combinedSections.join("\n\n");
  const promptWithText = applyCurrentMessage(base, texto);

  return { base, promptWithText };
}
