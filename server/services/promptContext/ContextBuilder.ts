// server/services/promptContext/ContextBuilder.ts
import { isDebug, log } from "./logger";
import { Selector, derivarNivel, detectarSaudacaoBreve } from "./Selector";
import type { BuildParams } from "./contextTypes";
import { ModuleCatalog } from "./moduleCatalog";
import { planBudget } from "./budget";
import { formatMemRecall } from "./memoryRecall";
import { buildInstructionBlocks, renderInstructionBlocks } from "./instructionPolicy";
import { composePrompt } from "./promptComposer";
import { applyReductions, stitchModules } from "./stitcher";

// 👇 Identidade MINI (70/30) + estilo curto
const ID_ECO =
  "Você é a Eco: espelho socrático de autoconhecimento — reflexiva, curiosa e acolhedora. " +
  "Proporção: 70% espelho (devolver padrões, clarear percepções) + 30% coach gentil (encorajamento, humor leve). " +
  "Objetivo: criar um espaço seguro de reflexão para o usuário se ver com mais clareza, com companhia curiosa e respeitosa. " +
  "Evite linguagem robótica, jargões de coaching, prescrições, diagnósticos e substituir terapia.";

const STYLE_HINTS =
  "Tom: reflexivo, claro, acolhedor, levemente bem-humorado. Use português brasileiro natural. " +
  "Responda curto (1–2 frases) quando possível. Se pedirem passos, no máximo 3 itens.";

export async function montarContextoEco(params: BuildParams): Promise<string> {
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

  const baseSelection = Selector.selecionarModulosBase({
    nivel,
    intensidade: memIntensity,
    flags: Selector.derivarFlags(texto),
  });

  const modulesRaw = Array.from(new Set(baseSelection.raw ?? []));
  const modulesAfterGating = Array.from(new Set(baseSelection.posGating ?? modulesRaw));

  const MIN_NV1: string[] = [
    "NV1_CORE.txt",
    "IDENTIDADE_MINI.txt", // manter alinhado à identidade 70/30
    "ANTISALDO_MIN.txt",
  ];
  const ordered: string[] = nivel === 1 ? MIN_NV1 : modulesAfterGating;

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
  if (aberturaHibrida?.sugestaoNivel != null) {
    extras.push(`Ajuste dinâmico de abertura (sugerido): ${aberturaHibrida.sugestaoNivel}`);
  }
  if (derivados?.resumoTopicos) {
    const top = String(derivados.resumoTopicos).slice(0, 220);
    extras.push(`Observações de continuidade: ${top}${top.length >= 220 ? "…" : ""}`);
  }

  const memRecallBlock = formatMemRecall(memsSemelhantesNorm);

  const promptCore = composePrompt({
    nivel,
    memCount,
    forcarMetodoViva,
    extras,
    stitched,
    memRecallBlock,
    instructionText,
    texto,
  });

  if (isDebug()) {
    const tokensContexto = ModuleCatalog.tokenCountOf("__INLINE__:ctx", texto);
    const overheadTokens = ModuleCatalog.tokenCountOf("__INLINE__:ovh", instructionText);
    const total = ModuleCatalog.tokenCountOf("__INLINE__:ALL", `${ID_ECO}\n${STYLE_HINTS}\n\n${promptCore}`);
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
  }

  // Prepend da identidade + estilo (garante 70/30 também na rota “full”)
  return `${ID_ECO}\n${STYLE_HINTS}\n\n${promptCore}`;
}

export const ContextBuilder = {
  async build(params: BuildParams) {
    return montarContextoEco(params);
  },
};

export default montarContextoEco;
