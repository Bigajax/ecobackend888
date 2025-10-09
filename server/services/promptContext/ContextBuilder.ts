import { firstName } from "../conversation/helpers";
import { computeEcoDecision } from "../conversation/ecoDecisionHub";
import { isDebug, log } from "./logger";
import { Selector } from "./Selector";
import { mapHeuristicasToFlags } from "./heuristicaFlags";
import type { BuildParams, SimilarMemory } from "./contextTypes";
import type { DecSnapshot } from "./Selector";
import { ModuleCatalog } from "./moduleCatalog";
import { planBudget } from "./budget";
import { formatMemRecall } from "./memoryRecall";
import { buildInstructionBlocks, renderInstructionBlocks } from "./instructionPolicy";
import { applyCurrentMessage, composePromptBase } from "./promptComposer";
import { applyReductions, stitchModules } from "./stitcher";

// ✨ usa o módulo central
import {
  ID_ECO_FULL,
  STYLE_HINTS_FULL,
  MEMORY_POLICY_EXPLICIT,
} from "./promptIdentity";

function collectTagsFromMemories(mems: SimilarMemory[] | undefined): string[] {
  if (!Array.isArray(mems)) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const memory of mems) {
    const tags = Array.isArray(memory?.tags) ? memory!.tags : [];
    for (const raw of tags) {
      if (typeof raw !== "string") continue;
      const tag = raw.trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
      if (out.length >= 6) return out;
    }
  }

  return out;
}

function renderDecBlock(dec: DecSnapshot): string {
  const viva = dec.vivaSteps.length ? dec.vivaSteps.join(" → ") : "none";
  const tags = dec.tags.length ? dec.tags.join(", ") : "none";
  const domain = dec.domain ?? "none";

  return [
    "DEC:",
    `  intensity: ${dec.intensity}`,
    `  openness: ${dec.openness}`,
    `  isVulnerable: ${dec.isVulnerable ? "true" : "false"}`,
    `  vivaSteps: ${viva}`,
    `  saveMemory: ${dec.saveMemory ? "true" : "false"}`,
    `  hasTechBlock: ${dec.hasTechBlock ? "true" : "false"}`,
    `  tags: ${tags}`,
    `  domain: ${domain}`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/*  INTENT RESOLVER — mapeia texto de entrada -> módulos extras               */
/*  Mantém o front agnóstico; funciona com as QuickSuggestions definidas      */
/* -------------------------------------------------------------------------- */
function inferIntentModules(texto: string): string[] {
  const t = (texto || "").toLowerCase();

  // 🔄 / 🌊 Revisitar memórias marcantes
  const wantsRevisit =
    /revisitar/.test(t) ||
    /momento marcante/.test(t) ||
    /emo[cç]?[aã]o forte do passado/.test(t) ||
    /lembran[çc]a/.test(t) ||
    /🔄|🌊/.test(texto);

  if (wantsRevisit) {
    return [
      "eco_memoria_revisitar_passado",
      "eco_observador_presente",
      "eco_corpo_emocao",
    ];
  }

  // 🧩 Checar vieses
  const wantsBiasCheck =
    /vi[eé]s|vieses|atalho mental|me enganando|heur[ií]stic/.test(t) || /🧩/.test(texto);
  if (wantsBiasCheck) {
    return [
      "eco_heuristica_ancoragem",
      "eco_heuristica_disponibilidade",
      "eco_heuristica_excesso_confianca",
      "eco_heuristica_regressao_media",
      "eco_heuristica_ilusao_validade",
    ];
  }

  // 🪞/🏛️ Reflexo estoico agora
  const wantsStoic =
    /reflexo estoico|estoic/.test(t) ||
    /sob meu controle|no seu controle/.test(t) ||
    /🪞|🏛️/.test(texto);
  if (wantsStoic) {
    return ["eco_presenca_racional", "eco_identificacao_mente", "eco_fim_do_sofrimento"];
  }

  // 💬 Vulnerabilidade
  const wantsCourage =
    /coragem.*expor|me expor mais|vulnerabil/.test(t) || /💬/.test(texto);
  if (wantsCourage) {
    return ["eco_vulnerabilidade_defesas", "eco_vulnerabilidade_mitos", "eco_emo_vergonha_combate"];
  }

  return [];
}

export interface ContextBuildResult {
  base: string;
  montarMensagemAtual: (textoAtual: string) => string;
}

export async function montarContextoEco(params: BuildParams): Promise<ContextBuildResult> {
  const {
    userId: _userId,
    userName: _userName,
    texto,
    mems = [],
    heuristicas: _heuristicas = [],
    userEmbedding: _userEmbedding = [],
    forcarMetodoViva = false,
    blocoTecnicoForcado: _blocoTecnicoForcado = null,
    skipSaudacao: _skipSaudacao = false,
    derivados = null,
    aberturaHibrida = null,
    perfil: _perfil = null,
    memsSemelhantes,
    memoriasSemelhantes,
    decision,
  } = params;

  const memsSemelhantesNorm =
    (memsSemelhantes && Array.isArray(memsSemelhantes) && memsSemelhantes.length
      ? memsSemelhantes
      : memoriasSemelhantes) || [];

  await ModuleCatalog.ensureReady();

  const heuristicaFlags = mapHeuristicasToFlags(_heuristicas);
  const ecoDecision = decision ?? computeEcoDecision(texto, { heuristicaFlags });
  const nivel = ecoDecision.openness as 1 | 2 | 3;
  const memCount = mems.length;

  const decisionTags = Array.isArray((ecoDecision as any).tags)
    ? ((ecoDecision as any).tags as string[])
    : [];
  const memoryTags = collectTagsFromMemories(memsSemelhantesNorm);
  const mergedTags = decisionTags.length > 0 ? decisionTags : memoryTags;
  const decisionDomainRaw = (ecoDecision as any).domain;

  const DEC: DecSnapshot = {
    intensity: ecoDecision.intensity,
    openness: nivel,
    isVulnerable: ecoDecision.isVulnerable,
    vivaSteps: ecoDecision.vivaSteps,
    saveMemory: ecoDecision.saveMemory,
    hasTechBlock: ecoDecision.hasTechBlock,
    tags: mergedTags,
    domain: typeof decisionDomainRaw === "string" ? decisionDomainRaw : null,
    flags: ecoDecision.flags,
  };

  const baseSelection = Selector.selecionarModulosBase({
    nivel,
    intensidade: ecoDecision.intensity,
    flags: ecoDecision.flags,
    hasTechBlock: ecoDecision.hasTechBlock,
  });
  ecoDecision.debug.modules = baseSelection.debug.modules;

  const toUnique = (list: string[] | undefined) =>
    Array.from(new Set(Array.isArray(list) ? list : []));

  // 🔎 módulos inferidos pelas intents dos QuickSuggestions
  const intentModules = inferIntentModules(texto);

  // Ordem: seleção base -> +intents (sem duplicar)
  const modulesRaw = toUnique([...toUnique(baseSelection.raw), ...intentModules]);

  const modulesAfterGating = baseSelection.posGating
    ? toUnique([...toUnique(baseSelection.posGating), ...intentModules])
    : modulesRaw;

  const ordered = baseSelection.priorizado?.length
    ? toUnique([...toUnique(baseSelection.priorizado), ...intentModules])
    : modulesAfterGating;

  const candidates = await ModuleCatalog.load(ordered);
  const selection = Selector.applyModuleMetadata({
    dec: DEC,
    baseOrder: ordered,
    candidates,
  });

  const modulesWithTokens = [...selection.regular, ...selection.footers].map((module) => ({
    name: module.name,
    text: module.text,
    tokens: ModuleCatalog.tokenCountOf(module.name, module.text),
    meta: module.meta,
  }));

  const budgetResult = planBudget({
    ordered: selection.orderedNames,
    candidates: modulesWithTokens,
  });

  const usedSet = new Set(budgetResult.used);

  const finalRegular = selection.regular.filter((module) => usedSet.has(module.name));
  const finalFooters = selection.footers.filter((module) => usedSet.has(module.name));

  const debugMap = selection.debug;
  for (const module of modulesWithTokens) {
    if (usedSet.has(module.name)) continue;
    const existing = debugMap.get(module.name);
    if (existing) {
      existing.activated = false;
      existing.source = "budget";
      if (existing.reason && existing.reason !== "pass" && existing.reason !== "budget") {
        existing.reason = `${existing.reason}|budget`;
      } else {
        existing.reason = "budget";
      }
      debugMap.set(module.name, existing);
    } else {
      debugMap.set(module.name, {
        id: module.name,
        source: "budget",
        activated: false,
        reason: "budget",
        threshold: null,
      });
    }
  }

  const moduleDebugEntries = Array.from(debugMap.values());
  ecoDecision.debug.modules = moduleDebugEntries;
  ecoDecision.debug.selectedModules = budgetResult.used;

  const reduced = applyReductions(
    finalRegular.map((module) => ({ name: module.name, text: module.text })),
    nivel
  );
  const stitched = stitchModules(reduced, nivel);
  const footerText = finalFooters
    .map((module) => module.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
  const decBlock = renderDecBlock(DEC);

  const instructionBlocks = buildInstructionBlocks(nivel);
  const instructionText = renderInstructionBlocks(instructionBlocks);

  const extras: string[] = [];
  const nomeUsuario = firstName(params.userName ?? undefined);
  if (nomeUsuario) {
    extras.push(
      `Usuário: ${nomeUsuario}. Use nome quando natural na conversa, nunca corrija ou diga frases como "sou ECO, não ${nomeUsuario}".`
    );
  }
  if (aberturaHibrida?.sugestaoNivel != null) {
    extras.push(`Ajuste dinâmico de abertura (sugerido): ${aberturaHibrida.sugestaoNivel}`);
  }
  if (derivados?.resumoTopicos) {
    const top = String(derivados.resumoTopicos).slice(0, 220);
    extras.push(`Observações de continuidade: ${top}${top.length >= 220 ? "…" : ""}`);
  }

  const askedAboutMemory =
    /\b(lembr(a|ou)|record(a|a-se)|mem[oó]ria(s)?|conversas? anteriores?)\b/i.test(texto);

  const hasMemories = Array.isArray(memsSemelhantesNorm) && memsSemelhantesNorm.length > 0;

  if (askedAboutMemory && hasMemories) {
    extras.push(
      "Se perguntarem se você lembra: responda afirmativamente e cite 1-2 pontos de MEMORIAS_RELEVANTES brevemente."
    );
  } else if (askedAboutMemory && !hasMemories) {
    extras.push(
      "Se perguntarem se você lembra e não houver MEMORIAS_RELEVANTES: diga que não encontrou memórias relacionadas desta vez e convide a resumir em 1 frase para registrar."
    );
  }

  // 🔁 Sempre injete bloco de memórias — mesmo vazio — para evitar o disclaimer do LLM
  const memRecallBlock =
    formatMemRecall(memsSemelhantesNorm) ||
    "MEMORIAS_RELEVANTES:\n(nenhuma encontrada desta vez)";

  const promptCoreBase = composePromptBase({
    nivel,
    memCount,
    forcarMetodoViva: ecoDecision.vivaSteps.length ? true : forcarMetodoViva,
    extras,
    stitched,
    footer: footerText,
    memRecallBlock,
    instructionText,
    decBlock,
  });

  // Monta base completa: Identidade + Estilo + Política de Memória + Core
  const base = `${ID_ECO_FULL}\n\n${STYLE_HINTS_FULL}\n\n${MEMORY_POLICY_EXPLICIT}\n\n${promptCoreBase}`;
  const montarMensagemAtual = (textoAtual: string) => applyCurrentMessage(base, textoAtual);

  const promptComTexto = montarMensagemAtual(texto);

  if (isDebug()) {
    log.debug("[ContextBuilder] módulos base", {
      nivel,
      ordered: selection.orderedNames,
      incluiEscala: selection.orderedNames.includes("ESCALA_ABERTURA_1a3.txt"),
      addByIntent: intentModules,
    });
    const tokensContexto = ModuleCatalog.tokenCountOf("__INLINE__:ctx", texto);
    const overheadTokens = ModuleCatalog.tokenCountOf("__INLINE__:ovh", instructionText);
    const total = ModuleCatalog.tokenCountOf("__INLINE__:ALL", promptComTexto);
    log.debug("[ContextBuilder] tokens & orçamento", {
      tokensContexto,
      overheadTokens,
      MAX_PROMPT_TOKENS: 8000,
      MARGIN_TOKENS: 256,
      budgetRestante: Math.max(0, 8000 - 256 - total),
    });
    log.debug("[Budgeter] resultado", {
      used: budgetResult.used,
      cut: budgetResult.cut,
      tokens: budgetResult.tokens,
    });
    log.debug("[ContextBuilder] debug módulos", {
      moduleDebugEntries,
    });
    log.info("[ContextBuilder] NV" + nivel + " pronto", { totalTokens: total });
    log.info("[ContextBuilder] memoria", {
      hasMemories,
      memHits: memsSemelhantesNorm.length,
      topResumo: memsSemelhantesNorm[0]?.resumo_eco?.slice(0, 100) ?? null,
    });
  }

  log.info("ECO_MODULE_DEBUG", {
    module_candidates: moduleDebugEntries.map((entry) => ({
      id: entry.id,
      source: entry.source,
      activated: entry.activated,
      reason: entry.reason,
      threshold: entry.threshold ?? null,
    })),
    selected_modules: budgetResult.used,
    dec: {
      intensity: DEC.intensity,
      openness: DEC.openness,
      isVulnerable: DEC.isVulnerable,
      vivaSteps: DEC.vivaSteps,
      saveMemory: DEC.saveMemory,
      hasTechBlock: DEC.hasTechBlock,
      tags: DEC.tags,
      domain: DEC.domain,
    },
  });

  return { base, montarMensagemAtual };
}

export const ContextBuilder = {
  async build(params: BuildParams): Promise<ContextBuildResult> {
    return montarContextoEco(params);
  },
  montarMensagemAtual(base: string, textoAtual: string): string {
    return applyCurrentMessage(base, textoAtual);
  },
};

export default montarContextoEco;
