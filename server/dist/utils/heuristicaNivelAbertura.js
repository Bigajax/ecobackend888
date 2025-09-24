"use strict";
// server/src/utils/heuristicaNivelAbertura.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.heuristicaNivelAbertura = heuristicaNivelAbertura;
exports.heuristicaNivelAberturaDebug = heuristicaNivelAberturaDebug;
// Retorna 1 | 2 | 3 conforme sinais de abertura no texto.
// 1 = superficial; 2 = reflexiva; 3 = profunda.
function heuristicaNivelAbertura(texto) {
    const raw = (texto || "").trim();
    if (!raw)
        return 1;
    // normalização PT-BR (minúsculas + sem acento)
    const t = raw.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    // saudações curtas → nivel 1
    const isGreeting = /^(oi|ola|oie|opa|e ai|eae|bom dia|boa tarde|boa noite)\b/.test(t) && t.length <= 40;
    if (isGreeting)
        return 1;
    // medidas básicas
    const words = t.split(/\s+/).filter(Boolean);
    const wc = words.length;
    const sc = (raw.match(/[.!?…]+/g) || []).length || (wc > 0 ? 1 : 0);
    // flags semânticas
    const introspectiva = /(quero entender|quero explorar|tenho pensado|estou pensando|reflet(i|indo)|me percebo|percebi|como lido|entender melhor|faz sentido|o que isso diz)/.test(t);
    const curiosidade = /(por que|porque|pq|explica|entender)/.test(t);
    const vulneravel = /(posso falar|dif[ii]cil de dizer|me sinto|sinto que|tenho sentido|quero abrir|preciso desabafar|posso compartilhar)/.test(t);
    // pontuação simples (0–6)
    let score = 0;
    // comprimento e estrutura
    if (wc >= 25)
        score += 1;
    if (wc >= 60)
        score += 1;
    if (sc >= 2)
        score += 1;
    if (sc >= 3)
        score += 1;
    // sinais de intenção/abertura
    if (introspectiva)
        score += 2;
    if (curiosidade)
        score += 1;
    if (vulneravel)
        score += 1;
    // muito curto e sem sinais → 1
    if (wc <= 6 && !introspectiva && !vulneravel && !curiosidade)
        return 1;
    // mapeamento final
    if (score >= 4)
        return 3;
    if (score >= 2)
        return 2;
    return 1;
}
// Opcional: ajuda a depurar/telemetria no Mixpanel etc.
function heuristicaNivelAberturaDebug(texto) {
    const raw = (texto || "").trim();
    const t = raw.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const wc = t ? t.split(/\s+/).filter(Boolean).length : 0;
    const sc = (raw.match(/[.!?…]+/g) || []).length || (wc > 0 ? 1 : 0);
    const isGreeting = /^(oi|ola|oie|opa|e ai|eae|bom dia|boa tarde|boa noite)\b/.test(t) && t.length <= 40;
    const introspectiva = /(quero entender|quero explorar|tenho pensado|estou pensando|reflet(i|indo)|me percebo|percebi|como lido|entender melhor|faz sentido|o que isso diz)/.test(t);
    const curiosidade = /(por que|porque|pq|explica|entender)/.test(t);
    const vulneravel = /(posso falar|dif[ii]cil de dizer|me sinto|sinto que|tenho sentido|quero abrir|preciso desabafar|posso compartilhar)/.test(t);
    let score = 0;
    if (wc >= 25)
        score += 1;
    if (wc >= 60)
        score += 1;
    if (sc >= 2)
        score += 1;
    if (sc >= 3)
        score += 1;
    if (introspectiva)
        score += 2;
    if (curiosidade)
        score += 1;
    if (vulneravel)
        score += 1;
    const nivel = isGreeting
        ? 1
        : score >= 4
            ? 3
            : score >= 2
                ? 2
                : 1;
    return {
        nivel,
        score,
        tokens: { wc, sc },
        flags: { isGreeting, introspectiva, curiosidade, vulneravel },
    };
}
//# sourceMappingURL=heuristicaNivelAbertura.js.map