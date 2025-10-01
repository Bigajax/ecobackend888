"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heuristicaFlagNames = void 0;
exports.mapHeuristicasToFlags = mapHeuristicasToFlags;
const heuristicasTriggers_1 = require("../../assets/config/heuristicasTriggers");
exports.heuristicaFlagNames = [
    "ancoragem",
    "causas_superam_estatisticas",
    "certeza_emocional",
    "excesso_intuicao_especialista",
    "ignora_regressao_media",
];
const arquivoFlagPairs = [
    ["eco_heuristica_ancoragem.txt", "ancoragem"],
    ["eco_heuristica_causas_superam_estatisticas.txt", "causas_superam_estatisticas"],
    ["eco_heuristica_certeza_emocional.txt", "certeza_emocional"],
    ["eco_heuristica_intuicao_especialista.txt", "excesso_intuicao_especialista"],
    ["eco_heuristica_regressao_media.txt", "ignora_regressao_media"],
];
const arquivoToFlag = (() => {
    const map = {};
    for (const [arquivo, flag] of arquivoFlagPairs) {
        const normalized = normalizeKey(arquivo);
        if (!normalized)
            continue;
        map[normalized] = flag;
        if (normalized.endsWith(".txt")) {
            const withoutExt = normalized.replace(/\.txt$/, "");
            if (!map[withoutExt]) {
                map[withoutExt] = flag;
            }
        }
    }
    return map;
})();
const tagToFlag = (() => {
    const map = {};
    for (const [arquivo, tags] of Object.entries(heuristicasTriggers_1.tagsPorHeuristica)) {
        const flag = arquivoToFlag[normalizeKey(arquivo)];
        if (!flag)
            continue;
        for (const tag of tags ?? []) {
            const key = normalizeKey(tag);
            if (key)
                map[key] = flag;
        }
    }
    return map;
})();
function normalizeKey(value) {
    if (typeof value !== "string")
        return "";
    return value.trim().toLowerCase();
}
function collectCandidateStrings(entry) {
    if (!entry || typeof entry !== "object")
        return [];
    const obj = entry;
    const candidates = [];
    ["arquivo", "file", "nome", "name", "id"].forEach((key) => {
        const value = obj[key];
        if (typeof value === "string") {
            candidates.push(value);
        }
    });
    return candidates;
}
function collectTags(entry) {
    if (!entry || typeof entry !== "object")
        return [];
    const obj = entry;
    const raw = obj["tags"];
    if (Array.isArray(raw)) {
        return raw.map((tag) => (typeof tag === "string" ? tag : "")).filter(Boolean);
    }
    if (typeof raw === "string") {
        return raw
            .split(/[,;]+/)
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    return [];
}
function mapHeuristicasToFlags(heuristicas) {
    const result = {};
    if (!Array.isArray(heuristicas) || heuristicas.length === 0)
        return result;
    for (const item of heuristicas) {
        if (!item)
            continue;
        if (typeof item === "string") {
            const flag = arquivoToFlag[normalizeKey(item)];
            if (flag) {
                result[flag] = true;
            }
            continue;
        }
        const candidates = collectCandidateStrings(item);
        for (const candidate of candidates) {
            const flag = arquivoToFlag[normalizeKey(candidate)];
            if (flag) {
                result[flag] = true;
            }
        }
        const tags = collectTags(item);
        for (const tag of tags) {
            const flag = tagToFlag[normalizeKey(tag)];
            if (flag) {
                result[flag] = true;
            }
        }
    }
    return result;
}
//# sourceMappingURL=heuristicaFlags.js.map