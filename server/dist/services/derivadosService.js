"use strict";
// services/derivadosService.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDerivados = getDerivados;
exports.insightAbertura = insightAbertura;
/* Utils seguras */
function ensureArray(v) {
    return Array.isArray(v) ? v : [];
}
function toNumber(n, fallback = 0) {
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}
function dicaDeEstilo(media) {
    if (media > 0.15)
        return 'compromissos concretos funcionam melhor';
    if (media < -0.15)
        return 'comece acolhendo antes de propor algo';
    return 'mantenha leve e curioso';
}
/** Núcleo que monta o objeto Derivados (não faz IO) */
async function getDerivadosInternal(statsRaw, marcosRaw, efeitosRaw, mediaRaw) {
    const stats = ensureArray(statsRaw);
    const marcos = ensureArray(marcosRaw);
    const eff = ensureArray(efeitosRaw);
    const media = toNumber(mediaRaw, 0);
    const abriu = eff.filter((i) => i?.x?.efeito === 'abriu').length;
    const fechou = eff.filter((i) => i?.x?.efeito === 'fechou').length;
    const neutro = eff.filter((i) => i?.x?.efeito === 'neutro').length;
    return {
        top_temas_30d: stats,
        marcos: marcos.map((m) => ({
            tema: m.tema,
            resumo: m.resumo_evolucao ?? null,
            marco_at: m.marco_at ?? null,
        })),
        heuristica_interacao: {
            efeitos_ultimas_10: { abriu, fechou, neutro },
            media_score: Number(media.toFixed(2)),
            dica_estilo: dicaDeEstilo(media),
        },
    };
}
/**
 * API pública RETROCOMPATÍVEL:
 * - Novo formato: getDerivados(stats, marcos, efeitos, media)
 * - Formato antigo (2 args): getDerivados(efeitos, marcos)
 *   (stats=[], media=0 por padrão)
 */
async function getDerivados(a, b, c, d) {
    // 4 argumentos → caminho novo
    if (arguments.length >= 3) {
        return getDerivadosInternal(a, b, c, d);
    }
    // 2 argumentos → compat com chamadas antigas (efeitos, marcos)
    if (arguments.length === 2) {
        const efeitos = a;
        const marcos = b;
        return getDerivadosInternal([], marcos, efeitos, 0);
    }
    // Nenhum/1 argumento → defaults seguros
    return getDerivadosInternal([], [], [], 0);
}
/** Insight curto para abrir a conversa (opcional) */
function insightAbertura(der) {
    if (!der)
        return null;
    if (der.marcos && der.marcos.length > 0) {
        const m = der.marcos[0];
        return m.resumo ?? `tema em destaque: "${m.tema}"`;
    }
    if (der.top_temas_30d && der.top_temas_30d.length > 0) {
        const t = der.top_temas_30d[0];
        return `tema recorrente: "${t.tema}" (últimos 30d)`;
    }
    return null;
}
//# sourceMappingURL=derivadosService.js.map