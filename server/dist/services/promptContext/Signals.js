"use strict";
// server/services/promptContext/Signals.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.construirStateSummary = construirStateSummary;
exports.construirNarrativaMemorias = construirNarrativaMemorias;
exports.renderDerivados = renderDerivados;
exports.loadStaticGuards = loadStaticGuards;
exports.buildOverhead = buildOverhead;
// ---------------------- logger ----------------------
const logger_1 = require("./logger");
// ---------------------- helpers de texto/estado ----------------------
function construirStateSummary(perfil, nivel) {
    if (!perfil)
        return "";
    const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(", ") || "nenhuma";
    const temas = Object.keys(perfil.temas_recorrentes || {}).join(", ") || "nenhum";
    const abertura = nivel === 1 ? "superficial" : nivel === 2 ? "reflexiva" : "profunda";
    const resumo = (perfil.resumo_geral_ia?.trim() ?? "") || "sem resumo geral registrado";
    const ultima = perfil.ultima_interacao_significativa ?? "nenhuma";
    const out = `\n🗺️ Estado Emocional Consolidado:
- Emoções frequentes: ${emocoes}
- Temas recorrentes: ${temas}
- Nível de abertura estimado: ${abertura}
- Última interação significativa: ${ultima}
- Resumo geral: ${resumo}`.trim();
    if ((0, logger_1.isDebug)()) {
        logger_1.log.debug("[Signals] construirStateSummary", {
            temPerfil: !!perfil,
            emocoes_keys: Object.keys(perfil.emocoes_frequentes || []),
            temas_keys: Object.keys(perfil.temas_recorrentes || []),
            nivel, abertura
        });
    }
    return out;
}
function construirNarrativaMemorias(mems) {
    if (!mems?.length)
        return "";
    const ord = [...mems]
        .sort((a, b) => (b.intensidade ?? 0) - (a.intensidade ?? 0) ||
        (b.similaridade ?? 0) - (a.similaridade ?? 0))
        .slice(0, 2);
    const temas = new Set();
    const emocoes = new Set();
    for (const m of ord) {
        (m.tags ?? []).slice(0, 3).forEach((t) => t && temas.add(t));
        if (m.emocao_principal)
            emocoes.add(m.emocao_principal);
    }
    const temasTxt = Array.from(temas).slice(0, 3).join(", ") || "—";
    const emocoesTxt = Array.from(emocoes).slice(0, 2).join(", ") || "—";
    const out = `\n📜 Continuidade: temas (${temasTxt}) e emoções (${emocoesTxt}); use só se fizer sentido agora.`;
    if ((0, logger_1.isDebug)()) {
        logger_1.log.debug("[Signals] construirNarrativaMemorias", {
            mems_in: mems.length,
            considerados: ord.length,
            temas: Array.from(temas),
            emocoes: Array.from(emocoes)
        });
    }
    return out;
}
function fmtData(d) {
    if (d == null)
        return null;
    const dt = new Date(d);
    return isNaN(+dt) ? null : dt.toLocaleDateString();
}
function renderDerivados(der, aberturaHibrida) {
    if (!der)
        return "";
    const temas = Array.isArray(der.top_temas_30d) ? der.top_temas_30d : [];
    const marcos = Array.isArray(der.marcos) ? der.marcos : [];
    const dica = der.dica_estilo ?? null;
    const eff = der.heuristica_interacao ?? null;
    const topTemas = temas
        .slice(0, 3)
        .map((t) => {
        const nome = t?.tema ?? t?.tag ?? t?.tema_nome ?? "tema";
        const tend = t?.tendencia ?? null;
        const f30 = t?.freq_30d ?? t?.freq30 ?? null;
        const f90 = t?.freq_90d ?? t?.freq90 ?? null;
        return `• ${nome}${tend ? ` (${tend})` : ""}${f30 != null ? ` — 30d:${f30}${f90 != null ? ` / 90d:${f90}` : ""}` : ""}`;
    })
        .join("\n");
    const marcosTxt = marcos
        .slice(0, 3)
        .map((m) => {
        const tm = m?.tema ?? m?.tag ?? "—";
        const r = m?.resumo ?? m?.resumo_evolucao ?? "";
        const at = fmtData(m?.marco_at);
        return `• ${tm}${at ? ` (${at})` : ""}: ${r}`;
    })
        .join("\n");
    const efeitos = eff ? `\nEfeitos últimas 10: abriu ${eff.abriu ?? 0} · fechou ${eff.fechou ?? 0} · neutro ${eff.neutro ?? 0}` : "";
    const dicaTxt = dica ? `\nDica de estilo: ${dica}` : "";
    const aberturaTxt = aberturaHibrida ? `\nSugestão de abertura leve: ${aberturaHibrida}` : "";
    const partes = [];
    if (temas.length)
        partes.push(`🔁 Temas recorrentes (30d):\n${topTemas}`);
    if (marcos.length)
        partes.push(`⏱️ Marcos recentes:\n${marcosTxt}`);
    if (efeitos)
        partes.push(efeitos);
    if (dicaTxt)
        partes.push(dicaTxt);
    if (aberturaTxt)
        partes.push(aberturaTxt);
    if (!partes.length)
        return "";
    const out = `\n🧩 Sinais de contexto (derivados):\n${partes.join("\n")}`;
    if ((0, logger_1.isDebug)()) {
        logger_1.log.debug("[Signals] renderDerivados", {
            temas_qtd: temas.length,
            marcos_qtd: marcos.length,
            tem_dica: !!dica,
            tem_eff: !!eff,
            aberturaHibrida: !!aberturaHibrida
        });
    }
    return out;
}
// ---------------------- guards estáticos (removidos) ----------------------
async function loadStaticGuards(_modulosDir) {
    // Sem leitura de arquivos — retornos vazios e silenciosos.
    if ((0, logger_1.isDebug)())
        logger_1.log.debug("[Signals] loadStaticGuards: sem guards estáticos");
    return {
        criterios: "",
        memoriaInstrucoes: "",
    };
}
// ---------------------- montagem de overhead ----------------------
function buildOverhead({ criterios, memoriaInstrucoes, responsePlanJson, instrucoesFinais, antiSaudacaoGuard, }) {
    const blocks = [
        criterios ? `\n${criterios}` : "",
        memoriaInstrucoes ? `\n${memoriaInstrucoes}` : "",
        `\nRESPONSE_PLAN:${responsePlanJson}`,
        instrucoesFinais,
        `\n${antiSaudacaoGuard}`,
    ]
        .filter(Boolean)
        .join("\n\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if ((0, logger_1.isDebug)()) {
        // não contamos tokens aqui para não acoplar com tiktoken; apenas tamanho em chars
        logger_1.log.debug("[Signals] buildOverhead", {
            criterios_len: (criterios ?? "").length,
            memoriaInstrucoes_len: (memoriaInstrucoes ?? "").length,
            responsePlan_len: responsePlanJson.length,
            instrucoesFinais_len: instrucoesFinais.length,
            antiSaudacao_len: antiSaudacaoGuard.length,
            total_chars: blocks.length
        });
    }
    return blocks;
}
//# sourceMappingURL=Signals.js.map