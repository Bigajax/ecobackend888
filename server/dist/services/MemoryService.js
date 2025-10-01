"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveMemoryOrReference = saveMemoryOrReference;
const EmbeddingAdapter_1 = require("../adapters/EmbeddingAdapter");
const updateEmotionalProfile_1 = require("./updateEmotionalProfile"); // seu arquivo
const referenciasService_1 = require("./referenciasService"); // seu arquivo
const CacheService_1 = require("./CacheService");
const mixpanelEvents_1 = require("../analytics/events/mixpanelEvents"); // seu arquivo
async function saveMemoryOrReference(opts) {
    const { supabase, userId, lastMessageId, cleaned, bloco, ultimaMsg } = opts;
    const analiseResumoSafe = typeof bloco?.analise_resumo === "string" ? bloco.analise_resumo.trim() : "";
    let textoParaEmbedding = [cleaned, analiseResumoSafe].filter(Boolean).join("\n").trim();
    if (!textoParaEmbedding || textoParaEmbedding.length < 3)
        textoParaEmbedding = "PLACEHOLDER EMBEDDING";
    else
        textoParaEmbedding = textoParaEmbedding.slice(0, 8000);
    const embeddingFinal = await (0, EmbeddingAdapter_1.getEmbeddingCached)(textoParaEmbedding, "memoria ou referencia");
    let referenciaAnteriorId = null;
    const { data: ultimaMemoria } = await supabase
        .from("memories")
        .select("id")
        .eq("usuario_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    // @ts-ignore
    referenciaAnteriorId = ultimaMemoria?.id ?? null;
    const intensidadeNum = typeof bloco?.intensidade === "number" ? Math.round(bloco.intensidade) : 0;
    const nivelNumerico = typeof bloco?.nivel_abertura === "number" ? Math.round(bloco.nivel_abertura)
        : bloco?.nivel_abertura === "baixo" ? 1 : bloco?.nivel_abertura === "médio" ? 2
            : bloco?.nivel_abertura === "alto" ? 3 : null;
    const payloadBase = {
        usuario_id: userId,
        mensagem_id: lastMessageId ?? null,
        resumo_eco: bloco?.analise_resumo ?? cleaned,
        emocao_principal: bloco?.emocao_principal || "indefinida",
        intensidade: intensidadeNum,
        contexto: ultimaMsg,
        dominio_vida: bloco?.dominio_vida ?? null,
        padrao_comportamental: bloco?.padrao_comportamental ?? null,
        nivel_abertura: nivelNumerico,
        categoria: bloco?.categoria ?? null,
        analise_resumo: bloco?.analise_resumo ?? null,
        tags: Array.isArray(bloco?.tags) ? bloco.tags : [],
        embedding: embeddingFinal,
        referencia_anterior_id: referenciaAnteriorId,
    };
    if (Number.isFinite(intensidadeNum)) {
        if (intensidadeNum >= 7) {
            const { error } = await supabase.from("memories").insert([{ ...payloadBase, salvar_memoria: true, created_at: new Date().toISOString() }]);
            if (!error) {
                try {
                    await (0, updateEmotionalProfile_1.updateEmotionalProfile)(userId);
                }
                catch { }
                (0, CacheService_1.invalidateResponseCacheForUser)(userId);
            }
            (0, mixpanelEvents_1.trackMemoriaRegistrada)({
                userId,
                intensidade: intensidadeNum,
                emocao: payloadBase.emocao_principal,
                dominioVida: payloadBase.dominio_vida,
                categoria: payloadBase.categoria,
            });
        }
        else if (intensidadeNum > 0) {
            await (0, referenciasService_1.salvarReferenciaTemporaria)(payloadBase);
            (0, mixpanelEvents_1.trackReferenciaEmocional)({
                userId,
                intensidade: intensidadeNum,
                emocao: payloadBase.emocao_principal,
                tags: payloadBase.tags,
                categoria: payloadBase.categoria,
            });
        }
        if (nivelNumerico === 3) {
            (0, mixpanelEvents_1.trackPerguntaProfunda)({
                userId,
                emocao: payloadBase.emocao_principal,
                intensidade: intensidadeNum,
                categoria: payloadBase.categoria,
                dominioVida: payloadBase.dominio_vida,
            });
        }
    }
}
//# sourceMappingURL=MemoryService.js.map