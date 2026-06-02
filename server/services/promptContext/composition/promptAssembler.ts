import { composePromptBase, applyCurrentMessage } from "../promptComposer";
import { buildContinuityModuleText, buildContinuityPromptLine } from "../pipeline/continuityResolver";
import { CACHE_PREFIX_SENTINEL } from "../../../utils/promptCache";

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

  // Modo cache (ECO_PROMPT_CACHE=1): identidade ESTÁVEL como prefixo cacheável + sentinela +
  // dinâmico (memória/DEC/instruções/mensagem). Default (flag off): ordem original, sem sentinela
  // → comportamento e golden tests idênticos. A reordenação muda a saliência da memória, por isso
  // fica atrás de flag e deve ser medida com `npm run eval:run` antes de virar padrão.
  if (process.env.ECO_PROMPT_CACHE === "1") {
    const stablePrefix = [...identitySections, ...staticSections]
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join("\n\n");
    const dynamic = [...contextSections.map((s) => s.trim()), promptCoreBase.trim()]
      .filter((s) => s.length > 0)
      .join("\n\n");
    const base = [stablePrefix, CACHE_PREFIX_SENTINEL, dynamic]
      .filter((s) => s.length > 0)
      .join("\n\n");
    return { base, promptWithText: applyCurrentMessage(base, texto) };
  }

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
