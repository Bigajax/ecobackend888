"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extrairBlocoPorRegex = extrairBlocoPorRegex;
exports.gerarBlocoTecnicoSeparado = gerarBlocoTecnicoSeparado;
exports.gerarBlocoTecnicoComCache = gerarBlocoTecnicoComCache;
// core/EmotionalAnalyzer.ts (ou onde este arquivo vive)
const CacheService_1 = require("../services/CacheService");
const OpenRouterAdapter_1 = require("../adapters/OpenRouterAdapter");
const EmbeddingAdapter_1 = require("../adapters/EmbeddingAdapter");
// ===== modelos =====
// Preferência por OpenAI 5.0; envs permitem override.
// Mantemos uma lista de fallback para lidar com variações de slug.
const MODEL_TECH = process.env.ECO_MODEL_TECH || "openai/gpt-5.0";
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5.0-mini";
// ordem de tentativa (primeiros são os preferidos)
const CANDIDATES_PRIMARY = [
    MODEL_TECH,
    "openai/gpt-5.0", // alias comum
    "openai/gpt-5.0-mini", // mini 5.0
];
const CANDIDATES_FALLBACK = [
    MODEL_TECH_ALT,
    "openai/gpt-5-chat", // compat anteriores
    "openai/gpt-5-mini",
];
// ===== heurística de extração “failsafe” =====
function extrairBlocoPorRegex(mensagemUsuario, respostaIa) {
    const texto = `${mensagemUsuario}\n${respostaIa}`.toLowerCase();
    const emocoes = {
        medo: [/medo/i, /receio/i, /temor/i, /insegur/i],
        ansiedade: [/ansiedad/i, /apreens/i, /nervos/i],
        tristeza: [/triste/i, /desanima/i, /abatid/i],
        raiva: [/raiva/i, /irrit/i, /frustr/i, /ódio/i],
        culpa: [/culpa/i, /remors/i, /arrepend/i],
    };
    let emocao_principal = null;
    for (const [emo, regs] of Object.entries(emocoes)) {
        if (regs.some((r) => r.test(texto))) {
            emocao_principal = emo;
            break;
        }
    }
    let intensidade = 0;
    if (emocao_principal) {
        const m3 = [/muito/i, /demais/i, /fort/i, /pânico/i, /crise/i];
        const m2 = [/bastante/i, /bem/i, /grande/i];
        intensidade = m3.some((r) => r.test(texto)) ? 3 : m2.some((r) => r.test(texto)) ? 2 : 1;
    }
    const dominio_vida = /trabalho|emprego|carreir/i.test(texto) ? "trabalho" :
        /fam[ií]lia|m[ãa]e|pai|irm[ãa]o/i.test(texto) ? "família" :
            /relacionament/i.test(texto) ? "relacionamentos" :
                /projeto|lançar|app|ia/i.test(texto) ? "projetos_pessoais" : null;
    const tags = [];
    if (emocao_principal)
        tags.push(emocao_principal);
    if (/projeto|lançar|app|ia/i.test(texto))
        tags.push("projeto");
    if (dominio_vida)
        tags.push(dominio_vida);
    return {
        emocao_principal,
        intensidade,
        tags,
        dominio_vida,
        padrao_comportamental: null,
        nivel_abertura: "médio",
        categoria: null,
        analise_resumo: respostaIa?.slice(0, 500) || null,
    };
}
// ===== prompt builders =====
function mkPrompt(enxuto, mensagemUsuario, respostaIa) {
    if (enxuto) {
        return `Retorne SOMENTE este JSON válido, sem comentários e sem markdown:
{"emocao_principal":"","intensidade":0,"tags":[],"dominio_vida":"","padrao_comportamental":"","nivel_abertura":"baixo","categoria":"","analise_resumo":"","tema_recorrente":null,"evolucao_temporal":null,"impacto_resposta_estimado":null,"sugestao_proximo_passo":null,"modo_hibrido_acionado":false,"tipo_referencia":null}
Baseie no texto do usuário: "${mensagemUsuario}"
e na resposta da IA: "${respostaIa}"
Se não souber algum campo, use null, [], "" ou 0.`;
    }
    return `
Extraia e retorne apenas o JSON abaixo, sem markdown/comentários.

Resposta da IA:
"""${respostaIa}"""

Mensagem original:
"${mensagemUsuario}"

JSON alvo:
{
  "emocao_principal": "",
  "intensidade": 0,
  "tags": [],
  "dominio_vida": "",
  "padrao_comportamental": "",
  "nivel_abertura": "baixo" | "médio" | "alto",
  "categoria": "",
  "analise_resumo": "",
  "tema_recorrente": null,
  "evolucao_temporal": null,
  "impacto_resposta_estimado": "abriu" | "fechou" | "neutro" | null,
  "sugestao_proximo_passo": null,
  "modo_hibrido_acionado": false,
  "tipo_referencia": "abertura" | "durante" | "emocao_intensa" | null
}`;
}
// ===== chamada com fallback de modelos =====
async function tryJsonWithModel(model, prompt, timeoutMs) {
    const headers = {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
        "X-Title": "Eco App - Bloco Tecnico",
    };
    const data = await (0, OpenRouterAdapter_1.callOpenRouterChat)({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 480,
        // quando o provedor suportar, força JSON:
        response_format: { type: "json_object" },
    }, headers, timeoutMs);
    const raw = data?.choices?.[0]?.message?.content ?? "";
    return (raw || "").trim();
}
async function gerarBlocoTecnicoSeparado(mensagemUsuario, respostaIa) {
    const firstPrompt = mkPrompt(false, mensagemUsuario, respostaIa);
    const fallbackPrompt = mkPrompt(true, mensagemUsuario, respostaIa);
    try {
        // 1) tentativas com os modelos “primários”
        for (const model of CANDIDATES_PRIMARY) {
            try {
                const raw = await tryJsonWithModel(model, firstPrompt, 4000);
                if (raw) {
                    const m = raw.match(/\{[\s\S]*\}/);
                    if (m)
                        return sanitizeJson(m[0], mensagemUsuario, respostaIa);
                }
                const raw2 = await tryJsonWithModel(model, fallbackPrompt, 3500);
                if (raw2) {
                    const m2 = raw2.match(/\{[\s\S]*\}/);
                    if (m2)
                        return sanitizeJson(m2[0], mensagemUsuario, respostaIa);
                }
            }
            catch { /* segue fallback */ }
        }
        // 2) tentativas com fallback
        for (const model of CANDIDATES_FALLBACK) {
            try {
                const raw = await tryJsonWithModel(model, fallbackPrompt, 3500);
                if (raw) {
                    const m = raw.match(/\{[\s\S]*\}/);
                    if (m)
                        return sanitizeJson(m[0], mensagemUsuario, respostaIa);
                }
            }
            catch { /* último recurso abaixo */ }
        }
        // 3) fallback heurístico
        return extrairBlocoPorRegex(mensagemUsuario, respostaIa);
    }
    catch {
        return extrairBlocoPorRegex(mensagemUsuario, respostaIa);
    }
}
function sanitizeJson(jsonStr, mensagemUsuario, respostaIa) {
    try {
        const parsed = JSON.parse(jsonStr);
        const permitido = [
            "emocao_principal", "intensidade", "tags", "dominio_vida", "padrao_comportamental",
            "nivel_abertura", "categoria", "analise_resumo", "tema_recorrente", "evolucao_temporal",
            "impacto_resposta_estimado", "sugestao_proximo_passo", "modo_hibrido_acionado", "tipo_referencia",
        ];
        const clean = {};
        for (const k of permitido)
            clean[k] = parsed[k] ?? null;
        const empty = !clean.emocao_principal &&
            (!Array.isArray(clean.tags) || !clean.tags.length) &&
            (!clean.intensidade || clean.intensidade === 0);
        return empty ? extrairBlocoPorRegex(mensagemUsuario, respostaIa) : clean;
    }
    catch {
        return extrairBlocoPorRegex(mensagemUsuario, respostaIa);
    }
}
async function gerarBlocoTecnicoComCache(mensagemUsuario, respostaIa) {
    const key = (0, EmbeddingAdapter_1.hashText)(mensagemUsuario + (respostaIa || "").slice(0, 200));
    if (CacheService_1.BLOCO_CACHE.has(key))
        return CacheService_1.BLOCO_CACHE.get(key);
    const bloco = await gerarBlocoTecnicoSeparado(mensagemUsuario, respostaIa);
    CacheService_1.BLOCO_CACHE.set(key, bloco);
    return bloco;
}
//# sourceMappingURL=EmotionalAnalyzer.js.map