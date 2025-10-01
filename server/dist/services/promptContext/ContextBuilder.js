"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextBuilder = void 0;
exports.montarContextoEco = montarContextoEco;
// server/services/promptContext/ContextBuilder.ts
const helpers_1 = require("../conversation/helpers");
const logger_1 = require("./logger");
const Selector_1 = require("./Selector");
const heuristicaFlags_1 = require("./heuristicaFlags");
const moduleCatalog_1 = require("./moduleCatalog");
const budget_1 = require("./budget");
const memoryRecall_1 = require("./memoryRecall");
const instructionPolicy_1 = require("./instructionPolicy");
const promptComposer_1 = require("./promptComposer");
const stitcher_1 = require("./stitcher");
// 👇 Identidade MINI (70/30) + estilo curto
const ID_ECO = "Você é a Eco: espelho socrático de autoconhecimento — reflexiva, curiosa e acolhedora. " +
    "Proporção: 70% espelho (devolver padrões, clarear percepções) + 30% coach gentil (encorajamento, humor leve). " +
    "Objetivo: criar um espaço seguro de reflexão para o usuário se ver com mais clareza, com companhia curiosa e respeitosa. " +
    "Evite linguagem robótica, jargões de coaching, prescrições, diagnósticos e substituir terapia.";
const STYLE_HINTS = "Tom: reflexivo, claro, acolhedor, levemente bem-humorado. Use português brasileiro natural. " +
    "Responda curto (1–2 frases) quando possível. Se pedirem passos, no máximo 3 itens.";
/* -------------------------------------------------------------------------- */
/*  INTENT RESOLVER — mapeia texto de entrada -> módulos extras               */
/*  Mantém o front agnóstico; funciona com as QuickSuggestions definidas      */
/* -------------------------------------------------------------------------- */
function inferIntentModules(texto) {
    const t = (texto || "").toLowerCase();
    // 🔄 / 🌊 Revisitar memórias marcantes
    const wantsRevisit = /revisitar/.test(t) ||
        /momento marcante/.test(t) ||
        /emo[cç]?[aã]o forte do passado/.test(t) ||
        /lembran[çc]a/.test(t) ||
        /🔄|🌊/.test(texto);
    if (wantsRevisit) {
        return [
            "eco_memoria_revisitar_passado",
            // pequenos apoios somáticos/presença para ancorar a recordação
            "eco_observador_presente",
            "eco_corpo_emocao",
        ];
    }
    // 🧩 Checar vieses / “Onde posso estar me enganando hoje?”
    const wantsBiasCheck = /vi[eé]s|vieses|atalho mental|me enganando|heur[ií]stic/.test(t) || /🧩/.test(texto);
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
    const wantsStoic = /reflexo estoico|estoic/.test(t) ||
        /sob meu controle|no seu controle/.test(t) ||
        /🪞|🏛️/.test(texto);
    if (wantsStoic) {
        return ["eco_presenca_racional", "eco_identificacao_mente", "eco_fim_do_sofrimento"];
    }
    // 💬 Coragem para se expor mais (vulnerabilidade & defesas)
    const wantsCourage = /coragem.*expor|me expor mais|vulnerabil/.test(t) || /💬/.test(texto);
    if (wantsCourage) {
        return ["eco_vulnerabilidade_defesas", "eco_vulnerabilidade_mitos", "eco_emo_vergonha_combate"];
    }
    return [];
}
async function montarContextoEco(params) {
    const { userId: _userId, userName: _userName, texto, mems = [], heuristicas: _heuristicas = [], userEmbedding: _userEmbedding = [], forcarMetodoViva = false, blocoTecnicoForcado: _blocoTecnicoForcado = null, skipSaudacao: _skipSaudacao = false, derivados = null, aberturaHibrida = null, perfil: _perfil = null, memsSemelhantes, memoriasSemelhantes, } = params;
    const memsSemelhantesNorm = (memsSemelhantes && Array.isArray(memsSemelhantes) && memsSemelhantes.length
        ? memsSemelhantes
        : memoriasSemelhantes) || [];
    const saudacaoBreve = (0, Selector_1.detectarSaudacaoBreve)(texto);
    const nivel = (0, Selector_1.derivarNivel)(texto, saudacaoBreve);
    const memIntensity = Math.max(0, ...mems.map((m) => Number(m?.intensidade ?? 0)));
    const memCount = mems.length;
    await moduleCatalog_1.ModuleCatalog.ensureReady();
    const heuristicaFlags = (0, heuristicaFlags_1.mapHeuristicasToFlags)(_heuristicas);
    const baseSelection = Selector_1.Selector.selecionarModulosBase({
        nivel,
        intensidade: memIntensity,
        flags: Selector_1.Selector.derivarFlags(texto, heuristicaFlags),
    });
    const toUnique = (list) => Array.from(new Set(Array.isArray(list) ? list : []));
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
    const candidates = await moduleCatalog_1.ModuleCatalog.load(ordered);
    const budgetResult = (0, budget_1.planBudget)({ ordered, candidates });
    const filtered = candidates.filter((candidate) => budgetResult.used.includes(candidate.name) && candidate.text.trim().length > 0);
    const reduced = (0, stitcher_1.applyReductions)(filtered, nivel);
    const stitched = (0, stitcher_1.stitchModules)(reduced, nivel);
    const instructionBlocks = (0, instructionPolicy_1.buildInstructionBlocks)(nivel);
    const instructionText = (0, instructionPolicy_1.renderInstructionBlocks)(instructionBlocks);
    const extras = [];
    const nomeUsuario = (0, helpers_1.firstName)(params.userName ?? undefined);
    if (nomeUsuario) {
        extras.push(`Usuário se chama ${nomeUsuario}; use o nome apenas quando fizer sentido.`);
    }
    if (aberturaHibrida?.sugestaoNivel != null) {
        extras.push(`Ajuste dinâmico de abertura (sugerido): ${aberturaHibrida.sugestaoNivel}`);
    }
    if (derivados?.resumoTopicos) {
        const top = String(derivados.resumoTopicos).slice(0, 220);
        extras.push(`Observações de continuidade: ${top}${top.length >= 220 ? "…" : ""}`);
    }
    const memRecallBlock = (0, memoryRecall_1.formatMemRecall)(memsSemelhantesNorm);
    const promptCoreBase = (0, promptComposer_1.composePromptBase)({
        nivel,
        memCount,
        forcarMetodoViva,
        extras,
        stitched,
        memRecallBlock,
        instructionText,
    });
    const base = `${ID_ECO}\n${STYLE_HINTS}\n\n${promptCoreBase}`;
    const montarMensagemAtual = (textoAtual) => (0, promptComposer_1.applyCurrentMessage)(base, textoAtual);
    const promptComTexto = montarMensagemAtual(texto);
    if ((0, logger_1.isDebug)()) {
        logger_1.log.debug("[ContextBuilder] módulos base", {
            nivel,
            ordered,
            incluiEscala: ordered.includes("ESCALA_ABERTURA_1a3.txt"),
            addByIntent: intentModules,
        });
        const tokensContexto = moduleCatalog_1.ModuleCatalog.tokenCountOf("__INLINE__:ctx", texto);
        const overheadTokens = moduleCatalog_1.ModuleCatalog.tokenCountOf("__INLINE__:ovh", instructionText);
        const total = moduleCatalog_1.ModuleCatalog.tokenCountOf("__INLINE__:ALL", promptComTexto);
        logger_1.log.debug("[ContextBuilder] tokens & orçamento", {
            tokensContexto,
            overheadTokens,
            MAX_PROMPT_TOKENS: 8000,
            MARGIN_TOKENS: 256,
            budgetRestante: Math.max(0, 8000 - 256 - total),
        });
        logger_1.log.debug("[Budgeter] resultado", {
            used: budgetResult.used,
            cut: budgetResult.cut,
            tokens: budgetResult.tokens,
        });
        logger_1.log.info("[ContextBuilder] NV" + nivel + " pronto", { totalTokens: total });
    }
    // Prepend da identidade + estilo (garante 70/30 também na rota “full”)
    return { base, montarMensagemAtual };
}
exports.ContextBuilder = {
    async build(params) {
        return montarContextoEco(params);
    },
    montarMensagemAtual(base, textoAtual) {
        return (0, promptComposer_1.applyCurrentMessage)(base, textoAtual);
    },
};
exports.default = montarContextoEco;
//# sourceMappingURL=ContextBuilder.js.map