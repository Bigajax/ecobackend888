import { firstName } from "../conversation/helpers";
import { computeEcoDecision } from "../conversation/ecoDecisionHub";
import { isDebug, log } from "./logger";
import { mapHeuristicasToFlags } from "./heuristicaFlags";
import type { BuildParams, SimilarMemory } from "./contextTypes";
import type { ContextMeta } from "../../utils/types";
import { buildInstructionBlocks, renderInstructionBlocks } from "./instructionPolicy";
import { applyCurrentMessage } from "./promptComposer";
import ModuleStore, { type EcoManifestEntry, type EcoManifestSnapshot } from "./ModuleStore";
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
import { buscarMemoriasSemanticas } from "../supabase/semanticMemoryClient";
import { formatMemoriesSection, injectMemoriesIntoPrompt, clampTokens } from "./memoryInjector";

const REQUIRED_MANIFEST_IDS = new Set([
  "identidade_core",
  "estrutura_resposta",
  "politica_perguntas",
  "politica_memoria",
  "tom_modo",
  "limites_clinicos",
]);

type ManifestRuntimeContext = {
  nivel: 1 | 2 | 3;
  intensity: number;
  isVulnerable: boolean;
  hasContinuity: boolean;
  hasCrisis: boolean;
};

type ManifestSelectionResult = {
  stitched: string;
  selected: Array<{ entry: EcoManifestEntry; text: string }>;
  snapshot: EcoManifestSnapshot;
  dropped: number;
};

function evaluateActivationCondition(
  condition: EcoManifestEntry["ativaSe"],
  ctx: ManifestRuntimeContext
): boolean {
  if (!condition) return true;

  if (typeof condition.intensidadeMin === "number" && ctx.intensity < condition.intensidadeMin) {
    return false;
  }

  if (
    typeof condition.vulnerabilidade === "boolean" &&
    condition.vulnerabilidade !== ctx.isVulnerable
  ) {
    return false;
  }

  if (
    typeof condition.continuidade === "boolean" &&
    condition.continuidade !== ctx.hasContinuity
  ) {
    return false;
  }

  if (typeof condition.crise === "boolean" && condition.crise !== ctx.hasCrisis) {
    return false;
  }

  if (Array.isArray(condition.todas) && condition.todas.length > 0) {
    const allPass = condition.todas.every((child) => evaluateActivationCondition(child, ctx));
    if (!allPass) return false;
  }

  if (Array.isArray(condition.qualquer) && condition.qualquer.length > 0) {
    const anyPass = condition.qualquer.some((child) => evaluateActivationCondition(child, ctx));
    if (!anyPass) return false;
  }

  return true;
}

async function loadManifestEntryText(entry: EcoManifestEntry): Promise<{ text: string; source: string } | null> {
  const fromStore = await ModuleStore.read(entry.path);
  if (fromStore && fromStore.trim().length > 0) {
    return { text: fromStore.trim(), source: "asset" };
  }

  if (typeof entry.conteudo === "string" && entry.conteudo.trim().length > 0) {
    return { text: entry.conteudo.trim(), source: "inline" };
  }

  return null;
}

async function selectManifestModules(
  snapshot: EcoManifestSnapshot,
  ctx: ManifestRuntimeContext
): Promise<ManifestSelectionResult | null> {
  const level = snapshot.levels.get(ctx.nivel) ?? null;
  const allowedIds = level ? new Set(level.modulos) : null;
  const candidates = snapshot.entries.filter((entry) => {
    if (entry.nivelMin > ctx.nivel || entry.nivelMax < ctx.nivel) return false;
    if (allowedIds && allowedIds.size > 0 && !allowedIds.has(entry.id) && !REQUIRED_MANIFEST_IDS.has(entry.id)) {
      return false;
    }
    return true;
  });

  const sorted = candidates.slice().sort((a, b) => {
    if (a.ordenacao !== b.ordenacao) return a.ordenacao - b.ordenacao;
    if (a.peso !== b.peso) return b.peso - a.peso;
    return a.id.localeCompare(b.id);
  });

  const selected: Array<{ entry: EcoManifestEntry; text: string }> = [];
  const selectedIds = new Set<string>();
  const excludedIds = new Set<string>();
  const maxByLevel = level ? Math.max(level.maxModulos, REQUIRED_MANIFEST_IDS.size) : Math.max(6, REQUIRED_MANIFEST_IDS.size);
  let dropped = 0;

  for (const entry of sorted) {
    const isMandatory = REQUIRED_MANIFEST_IDS.has(entry.id);
    const shouldConsider = isMandatory || evaluateActivationCondition(entry.ativaSe, ctx);
    if (!shouldConsider) {
      dropped += 1;
      continue;
    }

    if (excludedIds.has(entry.id)) {
      dropped += 1;
      continue;
    }

    if (!isMandatory && selected.length >= maxByLevel) {
      dropped += 1;
      continue;
    }

    const hasConflict = entry.excluiSe.some((target) => selectedIds.has(target));
    if (hasConflict) {
      dropped += 1;
      continue;
    }

    const loaded = await loadManifestEntryText(entry);
    if (!loaded) {
      log.warn("[manifest] missing_asset", { id: entry.id, path: entry.path });
      dropped += 1;
      continue;
    }

    if (loaded.source === "inline") {
      log.info("[manifest] inline_content", { id: entry.id, path: entry.path });
    }

    selected.push({ entry, text: loaded.text });
    selectedIds.add(entry.id);
    entry.excluiSe.forEach((target) => excludedIds.add(target));
  }

  if (selected.length === 0) {
    return null;
  }

  const stitched = selected
    .map(({ entry, text }) => {
      const header = `// ${entry.id}`;
      return `${header}\n${text}`.trim();
    })
    .filter((segment) => segment.length > 0)
    .join("\n\n");

  return { stitched, selected, snapshot, dropped };
}

async function buildManifestSelection(
  ctx: ManifestRuntimeContext
): Promise<ManifestSelectionResult | null> {
  const snapshot = await ModuleStore.getManifestSnapshot();
  if (!snapshot) return null;
  const selection = await selectManifestModules(snapshot, ctx);
  if (!selection) return null;

  log.info("[manifest] selection", {
    nivel: ctx.nivel,
    selected: selection.selected.length,
    dropped: selection.dropped,
  });

  return selection;
}

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

  await ModuleStore.bootstrap();
  const manifestSelection = await buildManifestSelection({
    nivel: ecoDecision.openness,
    intensity: ecoDecision.intensity,
    isVulnerable: ecoDecision.isVulnerable,
    hasContinuity,
    hasCrisis: Boolean(ecoDecision.flags?.crise),
  });

  if (manifestSelection && activationTracer) {
    const selectedIds = manifestSelection.selected.map((item) => item.entry.id);
    selectedIds.forEach((id) => activationTracer.addModule(id, "manifest", "selected"));
    activationTracer.mergeMetadata({
      manifest: {
        nivel: `L${ecoDecision.openness}`,
        selected: selectedIds,
        perguntaMax: manifestSelection.snapshot.defaults.perguntaMax ?? null,
        fluxo: manifestSelection.snapshot.defaults.fluxo ?? null,
        memoriaPolicy: manifestSelection.snapshot.defaults.registrarMemoriaQuando ?? [],
        idioma: manifestSelection.snapshot.defaults.idioma ?? null,
      },
    });
    ecoDecision.debug.selectedModules = Array.from(
      new Set([...(ecoDecision.debug.selectedModules ?? []), ...selectedIds])
    );
  }

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
  if (manifestSelection) {
    const base = manifestSelection.stitched.trim();
    const extra = stitchedFromPipeline.trim();
    stitched = base.length ? base : stitchedFromPipeline;
    if (base.length && extra.length) {
      stitched = `${base}\n\n${extra}`;
    }
  }
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
  // Retrieve and inject semantic memories if user is authenticated
  let baseWithMemories = base;
  if (typeof params.userId === "string" && params.userId.trim().length > 0) {
    const userId = params.userId as string;
    try {
      if (isDebug()) {
        log.debug("[ContextBuilder] retrieving_semantic_memories", {
          usuarioId: userId,
          queryTextLen: texto.length,
          hasBearer: Boolean(params.bearerToken),
        });
      }

      const memoriesResult = await buscarMemoriasSemanticas({
        usuarioId: userId,
        queryText: texto,
        bearerToken: params.bearerToken ?? undefined,
        topK: 10,
        minScore: 0.30,
        includeRefs: ecoDecision.openness >= 2,
      });

      if (memoriesResult.memories && memoriesResult.memories.length > 0) {
        const memoriesSection = formatMemoriesSection(
          memoriesResult.memories,
          clampTokens(1500, 2000)
        );

        if (memoriesSection) {
          baseWithMemories = injectMemoriesIntoPrompt(base, memoriesSection);

          if (isDebug()) {
            log.debug("[ContextBuilder] memories_injected", {
              count: memoriesResult.memories.length,
              minMaxScore: memoriesResult.minMaxScore,
            });
          }
        }
      } else if (isDebug()) {
        log.debug("[ContextBuilder] no_memories_retrieved", {
          minScore: memoriesResult.minScoreFinal,
        });
      }
    } catch (err) {
      log.warn("[ContextBuilder] memory_retrieval_failed", {
        message: err instanceof Error ? err.message : String(err),
        usuarioId: userId,
      });
    }
  }

  const montarMensagemAtual = (textoAtual: string) => applyCurrentMessage(baseWithMemories, textoAtual);

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

  return { base: baseWithMemories, montarMensagemAtual };
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
