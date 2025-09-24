"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.salvarReferenciaTemporaria = salvarReferenciaTemporaria;
// services/referenciasService.ts
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
const embeddingService_1 = require("./embeddingService");
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
function sanitizeTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0)
        return null;
    const cleaned = Array.from(new Set(tags.map(t => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)));
    return cleaned.slice(0, 16);
}
function sanitizeTexto(s, cap = 8000) {
    return (s || '').toString().trim().replace(/\s+/g, ' ').slice(0, cap);
}
function orNull(v) {
    return v == null ? null : v;
}
/**
 * Salva referência temporária com campos técnicos completos.
 * - Não seta created_at no client (usa DEFAULT do banco).
 * - Normaliza embedding (se vier) e remove se vazio.
 */
async function salvarReferenciaTemporaria(bloco) {
    try {
        if (!bloco?.usuario_id)
            throw new Error('usuario_id ausente');
        if (!bloco?.resumo_eco)
            throw new Error('resumo_eco ausente');
        if (!bloco?.contexto)
            throw new Error('contexto ausente');
        if (typeof bloco.intensidade !== 'number')
            throw new Error('intensidade ausente');
        // normalizações & sanitização
        const payload = {
            usuario_id: bloco.usuario_id,
            mensagem_id: orNull(bloco.mensagem_id),
            referencia_anterior_id: orNull(bloco.referencia_anterior_id),
            resumo_eco: sanitizeTexto(bloco.resumo_eco, 4000),
            emocao_principal: sanitizeTexto(bloco.emocao_principal, 128),
            intensidade: clamp(Number(bloco.intensidade) || 0, 0, 10),
            contexto: sanitizeTexto(bloco.contexto, 8000),
            dominio_vida: orNull(bloco.dominio_vida?.trim?.() || bloco.dominio_vida || null),
            padrao_comportamental: orNull(bloco.padrao_comportamental?.trim?.() || bloco.padrao_comportamental || null),
            nivel_abertura: typeof bloco.nivel_abertura === 'number' ? bloco.nivel_abertura : null,
            analise_resumo: orNull(bloco.analise_resumo?.trim?.() || bloco.analise_resumo || null),
            categoria: orNull(bloco.categoria?.trim?.() || bloco.categoria || null),
            tags: sanitizeTags(bloco.tags),
            salvar_memoria: false, // referência temporária por definição
        };
        // embedding: normaliza se vier e tem conteúdo; remove se vazio
        if (Array.isArray(bloco.embedding) && bloco.embedding.length > 0) {
            payload.embedding = (0, embeddingService_1.unitNorm)(bloco.embedding);
        }
        const { data, error } = await supabaseAdmin_1.supabaseAdmin
            .from('referencias_temporarias')
            .insert([payload])
            .select('id, created_at') // útil para confirmar
            .single();
        if (error) {
            console.error('❌ Erro ao salvar referência temporária:', {
                message: error.message,
                details: error?.details ?? null,
                hint: error?.hint ?? null,
                payloadPreview: {
                    usuario_id: payload.usuario_id,
                    temEmbedding: Array.isArray(payload.embedding),
                    referencia_anterior_id: payload.referencia_anterior_id,
                },
            });
            throw error;
        }
        console.log('✅ Referência temporária salva:', { id: data?.id, created_at: data?.created_at });
        return data;
    }
    catch (err) {
        console.error('❌ Erro inesperado em salvarReferenciaTemporaria:', err.message);
        throw err;
    }
}
//# sourceMappingURL=referenciasService.js.map