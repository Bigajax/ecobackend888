"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMemRecall = formatMemRecall;
const text_1 = require("../../utils/text");
const TOKEN_LIMIT = 350;
function normalizeAndLimit(text) {
    const normalized = (text || "").replace(/\s+/g, " ").trim();
    if (!normalized)
        return "";
    if ((0, text_1.countTokens)(normalized) <= TOKEN_LIMIT) {
        return normalized;
    }
    // LATENCY: truncar excerto para caber no orçamento de tokens por memória.
    let low = 0;
    let high = normalized.length;
    let best = "";
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = normalized.slice(0, mid).trim();
        if (!candidate) {
            high = mid - 1;
            continue;
        }
        if ((0, text_1.countTokens)(candidate) <= TOKEN_LIMIT) {
            best = candidate;
            low = mid + 1;
        }
        else {
            high = mid - 1;
        }
    }
    let finalText = best || normalized.slice(0, Math.max(1, high)).trim();
    while (finalText.length > 1 && (0, text_1.countTokens)(`${finalText}…`) > TOKEN_LIMIT) {
        finalText = finalText.slice(0, -1).trim();
    }
    return `${finalText}…`;
}
function formatMemRecall(mems) {
    if (!mems || !mems.length)
        return "";
    const pickText = (memory) => memory?.resumo_eco ||
        memory?.analise_resumo ||
        memory?.texto ||
        memory?.conteudo ||
        "";
    const linhas = mems.slice(0, 4).map((memory) => {
        const sim = typeof memory?.similarity === "number"
            ? memory.similarity
            : typeof memory?.similaridade === "number"
                ? memory.similaridade
                : undefined;
        const pct = typeof sim === "number" ? ` ~${Math.round(sim * 100)}%` : "";
        const value = normalizeAndLimit(String(pickText(memory)));
        return value ? `- ${value}${pct}` : "";
    });
    const blocos = linhas.filter(Boolean);
    if (!blocos.length)
        return "";
    const header = [
        "CONTINUIDADE — SINAIS DO HISTÓRICO (use com leveza, sem afirmar que “lembra”):",
        "Se (e somente se) fizer sentido, pode contextualizar com: “uma coisa que você compartilhou foi…”.",
    ].join("\n");
    return [header, ...blocos].join("\n---\n");
}
//# sourceMappingURL=memoryRecall.js.map