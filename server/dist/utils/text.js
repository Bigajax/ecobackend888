"use strict";
// server/utils/text.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeTrim = exports.clamp = exports.normalizeText = exports.formatarTextoEco = exports.limparResposta = exports.mapRoleForOpenAI = exports.sleep = exports.now = void 0;
exports.ensureEnvs = ensureEnvs;
exports.extractJson = extractJson;
exports.countTokens = countTokens;
exports.safeJoin = safeJoin;
// -----------------------------
// Tempo & utilitários básicos
// -----------------------------
const now = () => Date.now();
exports.now = now;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.sleep = sleep;
function ensureEnvs() {
    const required = ["OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length)
        throw new Error(`ENVs ausentes: ${missing.join(", ")}`);
}
// -----------------------------
// Mapeamento de roles p/ OpenAI
// -----------------------------
const mapRoleForOpenAI = (role) => {
    if (role === "assistant" || role === "model") {
        return "assistant";
    }
    if (role === "system") {
        return "system";
    }
    return "user";
};
exports.mapRoleForOpenAI = mapRoleForOpenAI;
// -----------------------------
// Sanitização & formatação
// -----------------------------
const limparResposta = (t) => (t || "")
    // remove blocos de código JSON e genéricos
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/gi, "")
    // remove HTML
    .replace(/<[^>]*>/g, "")
    // remove títulos ###...###
    .replace(/###.*?###/g, "")
    // normaliza quebras
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
exports.limparResposta = limparResposta;
const formatarTextoEco = (t) => (t || "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*\n\s*/g, "\n")
    // garante parágrafos (linha simples -> parágrafo)
    .replace(/(?<!\n)\n(?!\n)/g, "\n\n")
    // bullets bonitinhas
    .replace(/^\s+-\s+/gm, "— ")
    // tira espaços no início de linha
    .replace(/^\s+/gm, "")
    .trim();
exports.formatarTextoEco = formatarTextoEco;
// -----------------------------
// Normalização & parsing seguro
// -----------------------------
/**
 * Normaliza texto para comparações/regex:
 * - lower case
 * - remove acentos
 * - trim
 */
const normalizeText = (t) => (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
exports.normalizeText = normalizeText;
/**
 * Tenta extrair o primeiro JSON válido de um texto.
 * Se falhar, retorna null (não lança).
 */
function extractJson(text) {
    if (!text)
        return null;
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match)
            return null;
        return JSON.parse(match[0]);
    }
    catch {
        return null;
    }
}
// -----------------------------
// Contador de tokens (opcional)
// -----------------------------
let _enc = null;
/**
 * Conta tokens de forma robusta:
 * - Se @dqbd/tiktoken estiver disponível, usa encoder real (cl100k_base).
 * - Caso contrário, usa estimativa (≈ 4 chars por token).
 */
function countTokens(text) {
    const s = text || "";
    try {
        if (!_enc) {
            // require dinâmico para evitar issues de ESM/ciclos
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { get_encoding } = require("@dqbd/tiktoken");
            _enc = get_encoding("cl100k_base");
        }
        return _enc.encode(s).length;
    }
    catch {
        // fallback simples e rápido
        // (heurística comum: ~4 chars por token em inglês/pt)
        return Math.ceil(s.length / 4);
    }
}
// -----------------------------
// Helpers menores (opcionais)
// -----------------------------
/** Junta pedaços ignorando vazios e aplicando trim nos itens. */
function safeJoin(parts, sep = "\n\n") {
    return parts
        .map((p) => (p ?? "").toString().trim())
        .filter((p) => p.length > 0)
        .join(sep);
}
/** Clamp numérico simples. */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
exports.clamp = clamp;
/** Trim seguro que aceita undefined/null */
const safeTrim = (s) => (s ?? "").trim();
exports.safeTrim = safeTrim;
//# sourceMappingURL=text.js.map