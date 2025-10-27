import { firstName } from "../conversation/helpers";
import { computeEcoDecision } from "../conversation/ecoDecisionHub";
import { isDebug, log } from "./logger";
import { mapHeuristicasToFlags } from "./heuristicaFlags";
import type { BuildParams, SimilarMemory } from "./contextTypes";
import type { ContextMeta } from "../../utils/types";
import { buildInstructionBlocks, renderInstructionBlocks } from "./instructionPolicy";
import { applyCurrentMessage } from "./promptComposer";
import { ModuleCatalog } from "./moduleCatalog";
import { buildContextSections, renderDecBlock } from "./composition/contextSectionsBuilder";
import { loadIdentitySections } from "./composition/identityInjector";
import { assemblePrompt } from "./composition/promptAssembler";
import {
  resolveContinuity,
  buildContinuityModuleText,
  buildContinuityPromptLine,
} from "./pipeline/continuityResolver";
import { inferIntentModules } from "./selection/moduleSelector";
import { buildDecisionSignals } from "./pipeline/signalsBuilder";
import { resolveBiasSnapshots } from "./pipeline/biasesResolver";
import { executeModulePipeline } from "./selection/modulePipeline";
import { collectTagsFromMemories, deriveDominantDomain } from "./helpers/memoryHelpers";
import { initializeContext } from "./pipeline/contextInitializer";
import {
  buildDecSnapshot,
  updateDecisionDebug,
  resolveDecisionContext,
} from "./pipeline/decisionResolver";

export interface ContextBuildResult {
  base: string;
  montarMensagemAtual: (textoAtual: string) => string;
}


export async function montarContextoEco(params: BuildParams): Promise<ContextBuildResult> {
  const {
    userName: _userName,
    texto,
    heuristicas: _heuristicas = [],
    userEmbedding: _userEmbedding = [],
    forcarMetodoViva = false,
    blocoTecnicoForcado: _blocoTecnicoForcado = null,
    skipSaudacao: _skipSaudacao = false,
    derivados = null,
    aberturaHibrida = null,
    perfil: _perfil = null,
    decision,
    activationTracer,
    passiveSignals: passiveSignalsParam = null,
  } = params;

  const {
    contextFlagsBase,
    contextMetaBase,
    mems,
    hasMemories,
    memsSemelhantesNorm,
    normalizedUserId,
    normalizedGuestId,
    normalizedTexto,
    effectiveUserInsertId,
    memCount,
  } = initializeContext(params);

  const continuityResolution = await resolveContinuity({
    contextFlagsBase,
    contextMetaBase,
    normalizedUserId,
    normalizedTexto,
    memsSemelhantesNorm: Array.isArray(memsSemelhantesNorm)
      ? (memsSemelhantesNorm as SimilarMemory[])
      : [],
    hasMemories,
    effectiveUserInsertId,
  });

  const identityData = await loadIdentitySections();

  const contextFlags = continuityResolution.contextFlags;
  const contextMeta: ContextMeta = {
    ...continuityResolution.contextMeta,
    identityModules: identityData.identityModules.map((module) => module.name),
  };
  const continuityRef = contextMeta?.continuityRef;
  const hasContinuity = Boolean((contextFlags as any)?.HAS_CONTINUITY && continuityRef);

  await ModuleCatalog.ensureReady();

  const heuristicaFlags = mapHeuristicasToFlags(_heuristicas);
  const ecoDecision = decision ?? computeEcoDecision(texto, { heuristicaFlags });

  const identityKey = normalizedUserId || normalizedGuestId || "";
  const decisionContext = resolveDecisionContext({
    ecoDecision,
    heuristicaFlags,
    normalizedTexto,
    identityKey,
    passiveSignalsParam,
    contextMetaBase,
    memsSemelhantes: memsSemelhantesNorm,
  });
  const { heuristicsRuntime: heuristicsRuntimeActive, decisionSignals, biasSnapshots } =
    decisionContext;

  const decisionTagsRaw = Array.isArray((ecoDecision as any).tags)
    ? ((ecoDecision as any).tags as string[])
    : [];
  const decisionTags = decisionTagsRaw
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
  const memoryTags = collectTagsFromMemories(memsSemelhantesNorm as SimilarMemory[]);
  const mergedTags = (decisionTags.length > 0 ? decisionTags : memoryTags).slice(0, 4);
  const decisionDomainRaw = (ecoDecision as any).domain;
  const fallbackDomain = deriveDominantDomain(memsSemelhantesNorm as SimilarMemory[]);
  const resolvedDomain =
    typeof decisionDomainRaw === "string" && decisionDomainRaw.trim().length
      ? decisionDomainRaw.trim()
      : fallbackDomain;

  const DEC = buildDecSnapshot(ecoDecision, mergedTags, resolvedDomain ?? null);

  const modulePipeline = await executeModulePipeline({
    texto,
    ecoDecision,
    decSnapshot: DEC,
    decisionSignals,
    heuristicsRuntime: heuristicsRuntimeActive,
    biasSnapshots,
    hasContinuity,
    continuityRef,
    nivel: ecoDecision.openness,
    activationTracer,
  });

  const { selectionResult, knapsackResult, budgetResult, stitched: stitchedFromPipeline } =
    modulePipeline;

  let stitched = stitchedFromPipeline;
  if (!((contextFlags as any)?.HAS_CONTINUITY)) {
    stitched = stitched.replace(/pe[cç]o desculpas[^.]*mem[oó]ria[^.]*anteriores[^.]*\./gi, "");
    stitched = `[#] Sem continuidade detectada: responda a partir do presente, sem alegar falta de memória.\n\n${stitched}`;
  }

  log.info({ tag: "final_prompt_probe", head: stitched.slice(0, 200) });
  if (hasContinuity) {
    log.info({ tag: "continuity_in_prompt", ref: continuityRef ?? null });
  } else {
    const flagRequested = Boolean((contextFlags as any)?.HAS_CONTINUITY);
    const reason = flagRequested ? "ref null" : "flag false";
    log.warn({ tag: "continuity_skipped", reason });
  }

  const footerText = budgetResult.finalFooters
    .map((module) => module.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n")
    .trim();
  const decBlock = renderDecBlock(DEC);

  const instructionBlocks = buildInstructionBlocks(ecoDecision.openness);
  const instructionText = renderInstructionBlocks(instructionBlocks).trim();

  const nomeUsuario = firstName(params.userName ?? undefined);
  const sectionsResult = buildContextSections({
    hasMemories,
    mems,
    memsSemelhantesNorm,
    texto,
    nomeUsuario: nomeUsuario ?? null,
    hasContinuity,
    aberturaHibrida,
    derivados,
    nivel: ecoDecision.openness,
  });

  const assembly = assemblePrompt({
    nivel: ecoDecision.openness,
    memCount,
    forcarMetodoViva: ecoDecision.vivaSteps.length ? true : forcarMetodoViva,
    extras: sectionsResult.extras,
    stitched,
    footerText,
    instructionText,
    decBlock,
    hasContinuity,
    continuityRef,
    contextSections: sectionsResult.contextSections,
    identitySections: identityData.identitySections,
    staticSections: identityData.staticSections,
    texto,
  });

  const base = assembly.base;
  const montarMensagemAtual = (textoAtual: string) => applyCurrentMessage(base, textoAtual);

  const promptComTexto = assembly.promptWithText;

  if (isDebug()) {
    const tokensUserMsg = ModuleCatalog.tokenCountOf("__INLINE__:user_msg", texto);
    const overheadTokens = ModuleCatalog.tokenCountOf("__INLINE__:ovh", instructionText);
    const total = ModuleCatalog.tokenCountOf("__INLINE__:ALL", promptComTexto);
    const incluiDeveloperPrompt =
      selectionResult.ordered[0] === "developer_prompt.txt" ||
      selectionResult.ordered.includes("developer_prompt.txt");

    log.debug("[ContextBuilder] módulos base", {
      nivel: ecoDecision.openness,
      ordered: selectionResult.ordered,
      orderedAfterBudget: budgetResult.budgetResult.used,
      incluiDeveloperPrompt,
      incluiEscala: selectionResult.ordered.includes("escala_abertura_1a3.txt"),
      addByIntent: inferIntentModules(texto),
    });
    log.debug("[ContextBuilder] tokens & orçamento", {
      tokensUserMsg,
      overheadTokens,
      MAX_PROMPT_TOKENS: 8000,
      MARGIN_TOKENS: 256,
      budgetRestante: Math.max(0, 8000 - 256 - total),
    });
    log.debug("[Budgeter] resultado", {
      used: budgetResult.budgetResult.used,
      cut: budgetResult.budgetResult.cut,
      tokens: budgetResult.budgetResult.tokens,
    });
    log.debug("[ContextBuilder] debug módulos", {
      moduleDebugEntries: budgetResult.moduleDebugEntries,
    });
  }

  return { base, montarMensagemAtual };
}

export const __internals = {
  buildDecisionSignals,
  resolveBiasSnapshots,
};

export const ContextBuilder = {
  async build(params: BuildParams): Promise<ContextBuildResult> {
    return montarContextoEco(params);
  },
  montarMensagemAtual(base: string, textoAtual: string): string {
    return applyCurrentMessage(base, textoAtual);
  },
};

export default montarContextoEco;
