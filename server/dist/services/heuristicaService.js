"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buscarHeuristicasSemelhantes = buscarHeuristicasSemelhantes;
// services/buscarHeuristicas.ts
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
const embeddingService_1 = require("./embeddingService");
/**
 * Busca heurísticas semânticas semelhantes usando embeddings.
 *
 * Antigo:
 *   buscarHeuristicasSemelhantes("texto", userId, 0.75, 5)
 *
 * Novo:
 *   buscarHeuristicasSemelhantes({ userEmbedding, usuarioId: userId, matchCount: 5 })
 */
async function buscarHeuristicasSemelhantes(input, usuarioId, threshold = 0.8, matchCount = 5) {
    try {
        // ---------------------------
        // Normalização de parâmetros
        // ---------------------------
        let texto = "";
        let userEmbedding;
        let uid = null;
        let th = Math.max(0, Math.min(1, Number(threshold) || 0.8));
        let k = Math.max(1, Number(matchCount) || 5);
        let hydrate = true;
        if (typeof input === "string") {
            // modo antigo
            texto = input ?? "";
            uid = usuarioId ?? null;
        }
        else {
            // modo novo
            texto = input.texto ?? "";
            userEmbedding = input.userEmbedding;
            uid = input.usuarioId ?? null;
            if (typeof input.threshold === "number")
                th = Math.max(0, Math.min(1, input.threshold));
            if (typeof input.matchCount === "number")
                k = Math.max(1, input.matchCount);
            if (typeof input.hydrate === "boolean")
                hydrate = input.hydrate;
        }
        // Guard: sem embedding e texto curto → pula
        if (!userEmbedding && (!texto || texto.trim().length < 6)) {
            console.warn("⚠️ Texto curto e nenhum embedding fornecido — pulando busca de heurísticas.");
            return [];
        }
        // ---------------------------
        // Gera OU reaproveita o embedding (e normaliza)
        // ---------------------------
        const query_embedding = userEmbedding?.length
            ? (0, embeddingService_1.unitNorm)(userEmbedding)
            : (0, embeddingService_1.unitNorm)(await (0, embeddingService_1.embedTextoCompleto)(texto, "🔍 heuristica"));
        console.log(`📡 Embedding (heurística) pronto (dim=${query_embedding.length}).`);
        // ---------------------------
        // RPC (args devem bater com a função SQL existente)
        // public.buscar_heuristica_semelhante(
        //   input_usuario_id uuid, match_count int, match_threshold double precision, query_embedding vector
        // ) RETURNS TABLE(id uuid, similarity double precision)
        // ---------------------------
        const { data, error } = await supabaseAdmin_1.supabaseAdmin.rpc("buscar_heuristica_semelhante", {
            input_usuario_id: uid,
            match_count: k,
            match_threshold: th,
            query_embedding,
        });
        if (error) {
            console.error("❌ Erro RPC buscar_heuristica_semelhante:", {
                message: error.message,
                details: error?.details ?? null,
                hint: error?.hint ?? null,
            });
            return [];
        }
        const base = (data ?? [])
            .filter((r) => typeof r.similarity === "number" && r.similarity >= th);
        if (base.length === 0)
            return [];
        // ---------------------------
        // (Opcional) Hydrate: buscar metadados na tabela
        // Evitamos selecionar o campo "embedding" pra não pesar.
        // ---------------------------
        if (!hydrate) {
            // retorna só id + similarity
            return base.map((r) => ({ id: r.id, similarity: r.similarity }));
        }
        const ids = base.map((r) => r.id);
        // Atenção ao RLS: supabaseAdmin deve ter permissão de leitura.
        const { data: metas, error: metaErr } = await supabaseAdmin_1.supabaseAdmin
            .from("heuristicas_embeddings")
            .select("id, arquivo, tipo, origem, tags, usuario_id")
            .in("id", ids);
        if (metaErr) {
            console.warn("⚠️ Falha ao hidratar metadados de heurísticas:", {
                message: metaErr.message,
                details: metaErr?.details ?? null,
                hint: metaErr?.hint ?? null,
            });
            // devolve só o básico
            return base.map((r) => ({ id: r.id, similarity: r.similarity }));
        }
        // index para merge O(1)
        const metaIndex = new Map((metas ?? []).map((m) => [m.id, m]));
        // merge mantendo a ordem da RPC
        const merged = base.map((r) => {
            const m = metaIndex.get(r.id);
            return {
                id: r.id,
                similarity: r.similarity,
                arquivo: m?.arquivo ?? null,
                tipo: m?.tipo ?? null,
                origem: m?.origem ?? null,
                tags: m?.tags ?? null,
                usuario_id: m?.usuario_id ?? null,
            };
        });
        // ⚠️ Se você quiser filtrar por tipo, faça aqui (agora com segurança):
        // return merged.filter((item) => ["cognitiva", "filosofico"].includes(item.tipo ?? ""));
        return merged;
    }
    catch (err) {
        console.error("❌ Erro inesperado ao gerar/usar embedding ou buscar heurísticas:", err.message);
        return [];
    }
}
//# sourceMappingURL=heuristicaService.js.map