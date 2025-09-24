"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buscarUltimaReferenciaOuMemoria = buscarUltimaReferenciaOuMemoria;
exports.salvarMemoriaComEncadeamento = salvarMemoriaComEncadeamento;
exports.salvarReferenciaComEncadeamento = salvarReferenciaComEncadeamento;
// services/encadeamentoService.ts
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
/**
 * Retorna a última memória OU referência do usuário.
 * Usa RPC: public.buscar_ultima_memoria_ou_referencia(usuario_id_input uuid)
 */
async function buscarUltimaReferenciaOuMemoria(usuario_id) {
    try {
        const { data, error } = await supabaseAdmin_1.supabaseAdmin
            .rpc('buscar_ultima_memoria_ou_referencia', { usuario_id_input: usuario_id })
            .single();
        if (error) {
            console.warn('⚠️ RPC buscar_ultima_memoria_ou_referencia falhou:', {
                message: error.message,
                details: error?.details ?? null,
                hint: error?.hint ?? null,
            });
            return null;
        }
        if (!data) {
            console.log('ℹ️ Nenhuma memória/referência anterior encontrada.');
            return null;
        }
        console.log('✅ Última memória/referência encontrada:', data);
        return data;
    }
    catch (err) {
        console.error('❌ Erro inesperado em buscarUltimaReferenciaOuMemoria:', err.message);
        return null;
    }
}
/** Utils */
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
function sanitizeTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0)
        return null;
    const cleaned = Array.from(new Set(tags
        .map((t) => (typeof t === 'string' ? t.trim() : ''))
        .filter(Boolean)));
    // limite opcional para não estourar payloads
    return cleaned.slice(0, 16);
}
function sanitizeResumo(texto) {
    const t = (texto || '').toString().trim().replace(/\s+/g, ' ');
    // opcional: hard cap pra evitar payloads gigantes
    return t.slice(0, 4000);
}
function sanitizeEmocao(v) {
    if (!v)
        return null;
    const t = v.trim();
    return t ? t : null;
}
/**
 * Monta payload sanitizado e com encadeamento.
 * Se `referencia_anterior_id` não vier, busca a última memória/referência do usuário.
 */
async function buildPayloadComEncadeamento(mem) {
    const anterior = typeof mem.referencia_anterior_id === 'string'
        ? { id: mem.referencia_anterior_id }
        : await buscarUltimaReferenciaOuMemoria(mem.usuario_id);
    const payload = {
        usuario_id: mem.usuario_id,
        resumo_eco: sanitizeResumo(mem.resumo_eco),
        intensidade: clamp(Number(mem.intensidade) || 0, 0, 10),
        emocao_principal: sanitizeEmocao(mem.emocao_principal),
        tags: sanitizeTags(mem.tags) ?? null,
        mensagem_id: mem.mensagem_id ?? null,
        referencia_anterior_id: anterior?.id ?? null,
        // ❗ NÃO enviamos created_at: deixamos o banco aplicar DEFAULT now()
    };
    return payload;
}
/**
 * Função genérica para salvar em uma tabela (memories | referencias_temporarias)
 * já com encadeamento resolvido.
 */
async function salvarComEncadeamentoGenerico(tabela, mem) {
    try {
        const payload = await buildPayloadComEncadeamento(mem);
        const { data, error } = await supabaseAdmin_1.supabaseAdmin
            .from(tabela)
            .insert(payload)
            .select('id') // retorna o id criado
            .single();
        if (error) {
            console.error(`❌ Erro ao salvar em ${tabela}:`, {
                message: error.message,
                details: error?.details ?? null,
                hint: error?.hint ?? null,
            });
            return { ok: false, error: error.message };
        }
        console.log(`✅ Registro salvo com encadeamento em ${tabela}:`, {
            id: data?.id,
            referencia_anterior_id: payload.referencia_anterior_id,
        });
        return { ok: true, id: data?.id };
    }
    catch (err) {
        console.error(`❌ Erro inesperado ao salvar em ${tabela}:`, err.message);
        return { ok: false, error: err.message };
    }
}
/**
 * Salva uma nova memória encadeada em `memories`.
 * (Se quiser forçar salvar no passado, adicione created_at no payload e garanta permissão RLS)
 */
async function salvarMemoriaComEncadeamento(mem) {
    return salvarComEncadeamentoGenerico('memories', mem);
}
/**
 * Salva uma nova referência temporária encadeada em `referencias_temporarias`.
 */
async function salvarReferenciaComEncadeamento(mem) {
    return salvarComEncadeamentoGenerico('referencias_temporarias', mem);
}
//# sourceMappingURL=encadeamentoService.js.map