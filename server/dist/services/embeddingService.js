"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedTextoCompleto = void 0;
exports.unitNorm = unitNorm;
exports.gerarEmbeddingOpenAI = gerarEmbeddingOpenAI;
// embeddingService.ts
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
// Backoff simples
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Normaliza o vetor para norma-2 = 1 (útil para métricas de cosseno). */
function unitNorm(vec) {
    // filtra NaN/Infinity defensivamente
    const clean = vec.map((v) => (Number.isFinite(v) ? v : 0));
    const norm = Math.sqrt(clean.reduce((s, v) => s + v * v, 0)) || 1;
    return clean.map((v) => v / norm);
}
/**
 * Gera embedding vetorial do texto usando OpenAI.
 * - Se `texto` já for um vetor (number[]), **normaliza** e retorna (evita recomputar).
 */
async function gerarEmbeddingOpenAI(texto, origem) {
    try {
        // 1) Já veio vetor → normaliza e retorna
        if (Array.isArray(texto) && texto.every((x) => typeof x === "number")) {
            const v = unitNorm(texto);
            if (v.length < 128) {
                console.warn(`⚠️ Embedding recebido muito curto${origem ? ` [${origem}]` : ""} (${v.length} dims).`);
            }
            return v;
        }
        // 2) Conversão segura para string
        let textoConvertido = "";
        if (typeof texto === "string") {
            textoConvertido = texto.trim();
        }
        else if (texto != null && typeof texto.toString === "function") {
            textoConvertido = texto.toString().trim();
        }
        // 3) Fallback para textos vazios/curtos
        if (!textoConvertido || textoConvertido.length < 3) {
            console.warn(`⚠️ Texto para embedding inválido${origem ? ` [${origem}]` : ""}. Usando placeholder.`);
            textoConvertido = "PLACEHOLDER EMBEDDING";
        }
        // 4) Normalização leve + corte pra evitar inputs gigantes
        const textoParaEmbedding = textoConvertido.replace(/\s+/g, " ").slice(0, 8000);
        // 5) Chamada à OpenAI com retries (429/5xx)
        const maxTries = 3;
        let lastErr = null;
        for (let attempt = 1; attempt <= maxTries; attempt++) {
            try {
                const response = await openai.embeddings.create({
                    model: "text-embedding-3-small", // 1536 dims
                    input: textoParaEmbedding,
                });
                const embedding = response.data?.[0]?.embedding;
                if (!Array.isArray(embedding) || embedding.length < 128) {
                    throw new Error("Embedding não gerado ou incompleto.");
                }
                const norm = unitNorm(embedding);
                console.log(`📡 Embedding gerado com sucesso${origem ? ` [${origem}]` : ""} (dim=${norm.length}).`);
                return norm;
            }
            catch (err) {
                lastErr = err;
                const status = err?.status || err?.response?.status;
                const retriable = status === 429 || (status >= 500 && status < 600);
                console.warn(`⚠️ Falha ao gerar embedding (tentativa ${attempt}/${maxTries})${origem ? ` [${origem}]` : ""} — status: ${status ?? "n/a"} — ${err?.message || err}`);
                if (attempt < maxTries && retriable) {
                    await sleep(400 * attempt); // backoff linear
                    continue;
                }
                break;
            }
        }
        throw lastErr ?? new Error("Falha desconhecida ao gerar embedding.");
    }
    catch (error) {
        console.error(`🚨 Erro ao gerar embedding${origem ? ` [${origem}]` : ""}:`, error?.message || error);
        throw error;
    }
}
// Compat: nome antigo
exports.embedTextoCompleto = gerarEmbeddingOpenAI;
//# sourceMappingURL=embeddingService.js.map