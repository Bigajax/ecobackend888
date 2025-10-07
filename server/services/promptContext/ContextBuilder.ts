import { firstName } from "../conversation/helpers";
import { isDebug, log } from "./logger";
import { Selector, derivarNivel, detectarSaudacaoBreve } from "./Selector";
import { mapHeuristicasToFlags } from "./heuristicaFlags";
import type { BuildParams } from "./contextTypes";
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
  } = params;

  const memsSemelhantesNorm =
    (memsSemelhantes && Array.isArray(memsSemelhantes) && memsSemelhantes.length
      ? memsSemelhantes
      : memoriasSemelhantes) || [];

  const saudacaoBreve = detectarSaudacaoBreve(texto);
  const nivel = derivarNivel(texto, saudacaoBreve) as 1 | 2 | 3;

  const memIntensity = Math.max(0, ...mems.map((m) => Number(m?.intensidade ?? 0)));
  const memCount = mems.length;

  await ModuleCatalog.ensureReady();

  const heuristicaFlags = mapHeuristicasToFlags(_heuristicas);

  const baseSelection = Selector.selecionarModulosBase({
    nivel,
    intensidade: memIntensity,
    flags: Selector.derivarFlags(texto, heuristicaFlags),
  });

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
  const budgetResult = planBudget({ ordered, candidates });

  const filtered = candidates.filter(
    (candidate) => budgetResult.used.includes(candidate.name) && candidate.text.trim().length > 0
  );

  const reduced = applyReductions(filtered, nivel);
  const stitched = stitchModules(reduced, nivel);

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
    forcarMetodoViva,
    extras,
    stitched,
    memRecallBlock,
    instructionText,
  });

  // Monta base completa: Identidade + Estilo + Política de Memória + Core
  const base = `${ID_ECO_FULL}\n\n${STYLE_HINTS_FULL}\n\n${MEMORY_POLICY_EXPLICIT}\n\n${promptCoreBase}`;
  const montarMensagemAtual = (textoAtual: string) => applyCurrentMessage(base, textoAtual);

  const promptComTexto = montarMensagemAtual(texto);

  if (isDebug()) {
    log.debug("[ContextBuilder] módulos base", {
      nivel,
      ordered,
      incluiEscala: ordered.includes("ESCALA_ABERTURA_1a3.txt"),
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
    log.info("[ContextBuilder] NV" + nivel + " pronto", { totalTokens: total });
    log.info("[ContextBuilder] memoria", {
      hasMemories,
      memHits: memsSemelhantesNorm.length,
      topResumo: memsSemelhantesNorm[0]?.resumo_eco?.slice(0, 100) ?? null,
    });
  }

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
