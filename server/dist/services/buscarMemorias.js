"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buscarMemoriasSemelhantes = buscarMemoriasSemelhantes;
// services/buscarMemorias.ts
const embeddingService_1 = require("./embeddingService");
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
/**
 * Busca memórias semelhantes usando a RPC v2 com fallback de janela temporal.
 * Compatível com:
 *   buscarMemoriasSemelhantes(userId, "texto")
 *   buscarMemoriasSemelhantes(userId, { userEmbedding, k: 6, threshold: 0.8 })
 */
async function buscarMemoriasSemelhantes(userIdOrNull, entradaOrOpts) {
    try {
        // ---------------------------
        // Normalização de parâmetros
        // ---------------------------
        let texto = "";
        let userEmbedding;
        let k = 6;
        let threshold = 0.8; // ✅ default mais útil
        let daysBack = 30;
        let userId = userIdOrNull;
        if (typeof entradaOrOpts === "string") {
            texto = entradaOrOpts ?? "";
        }
        else {
            texto = entradaOrOpts.texto ?? "";
            userEmbedding = entradaOrOpts.userEmbedding;
            k = typeof entradaOrOpts.k === "number" ? entradaOrOpts.k : k;
            threshold =
                typeof entradaOrOpts.threshold === "number" ? entradaOrOpts.threshold : threshold;
            daysBack =
                typeof entradaOrOpts.daysBack === "number" ||
                    entradaOrOpts.daysBack === null
                    ? entradaOrOpts.daysBack
                    : daysBack;
            if (typeof entradaOrOpts.userId === "string")
                userId = entradaOrOpts.userId;
        }
        // Guarda: se não veio embedding e o texto é muito curto, evita custo
        if (!userEmbedding && (!texto || texto.trim().length < 6))
            return [];
        // ---------------------------
        // Gera OU reaproveita o embedding (e normaliza)
        // ---------------------------
        const queryEmbedding = userEmbedding?.length
            ? (0, embeddingService_1.unitNorm)(userEmbedding)
            : (0, embeddingService_1.unitNorm)(await (0, embeddingService_1.embedTextoCompleto)(texto));
        const match_count = Math.max(1, k);
        const match_threshold = Math.max(0, Math.min(1, Number(threshold) || 0.8));
        // Helper para chamar a RPC v2 com days_back variável
        const call = async (db) => {
            const { data, error } = await supabaseAdmin_1.supabaseAdmin.rpc("buscar_memorias_semelhantes_v2", {
                query_embedding: queryEmbedding, // vector(1536)
                user_id_input: userId, // uuid ou null (busca global se null)
                match_count,
                match_threshold,
                days_back: db, // inteiro (dias) ou null
            });
            if (error) {
                console.warn("⚠️ RPC buscar_memorias_semelhantes_v2 falhou:", {
                    message: error.message,
                    details: error?.details,
                    hint: error?.hint,
                });
                return [];
            }
            return (data ?? []);
        };
        // ---------------------------
        // Estratégia de fallback: 30d → 180d → sem filtro
        // ---------------------------
        let rows = [];
        const tryOrder = daysBack === null ? [null] : [daysBack ?? 30, 180, null];
        for (const db of tryOrder) {
            rows = await call(db);
            if (rows && rows.length)
                break;
        }
        // Normaliza resultado para o shape da app
        return rows
            .map((d) => ({
            id: d.id,
            resumo_eco: d.resumo_eco,
            tags: d.tags ?? undefined,
            emocao_principal: d.emocao_principal ?? undefined,
            intensidade: typeof d.intensidade === "number" ? d.intensidade : Number(d.intensidade),
            created_at: d.created_at,
            similarity: typeof d.similarity === "number"
                ? d.similarity
                : typeof d.similaridade === "number"
                    ? d.similaridade
                    : undefined,
            distancia: typeof d.distancia === "number"
                ? d.distancia
                : typeof d.similarity === "number"
                    ? 1 - d.similarity
                    : undefined,
        }))
            .slice(0, k);
    }
    catch (e) {
        console.error("❌ Erro interno ao buscar memórias:", e.message);
        return [];
    }
}
//# sourceMappingURL=buscarMemorias.js.map