"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buscarReferenciasSemelhantesV2 = void 0;
exports.buscarReferenciasSemelhantes = buscarReferenciasSemelhantes;
// services/buscarReferenciasSemelhantes.ts
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
const prepareQueryEmbedding_1 = require("./prepareQueryEmbedding");
const EMB_DIM = 1536; // ✅ coloque aqui a dimensão real do seu embedding (ou deixe undefined se não fixou)
async function buscarReferenciasSemelhantes(userId, entradaOrOpts) {
    try {
        // ---------------- Normalização de parâmetros ----------------
        let texto = "";
        let userEmbedding;
        let k = 5;
        let threshold = 0.8;
        if (typeof entradaOrOpts === "string") {
            texto = entradaOrOpts ?? "";
        }
        else {
            texto = entradaOrOpts.texto ?? "";
            userEmbedding = entradaOrOpts.userEmbedding;
            if (typeof entradaOrOpts.k === "number")
                k = entradaOrOpts.k;
            if (typeof entradaOrOpts.threshold === "number")
                threshold = entradaOrOpts.threshold;
        }
        if (!userId)
            return [];
        if (!userEmbedding && (!texto || texto.trim().length < 6))
            return [];
        // ---------------- Embedding (gera OU reaproveita) ----------------
        const queryEmbedding = await (0, prepareQueryEmbedding_1.prepareQueryEmbedding)({
            texto,
            userEmbedding,
            tag: "refs",
        });
        if (!queryEmbedding)
            return [];
        // ✅ (opcional) validar dimensão do vetor para evitar 42883/42804 no Postgres
        if (typeof EMB_DIM === "number" && queryEmbedding.length !== EMB_DIM) {
            console.warn(`Embedding dimension mismatch: expected ${EMB_DIM}, got ${queryEmbedding.length}`);
            return [];
        }
        const match_count = Math.max(1, k);
        const match_threshold = Math.min(1, Math.max(0, Number(threshold) || 0.8));
        // ---------------- RPC: buscar_referencias_similares ----------------
        const { data, error } = await supabaseAdmin_1.supabase.rpc("buscar_referencias_similares", {
            filtro_usuario: userId,
            query_embedding: queryEmbedding, // array<number> -> Postgres vector
            match_count,
            match_threshold,
        });
        if (error) {
            console.warn("⚠️ RPC buscar_referencias_similares falhou:", {
                message: error.message,
                details: error?.details,
                hint: error?.hint,
            });
            return [];
        }
        const rows = (data ?? []);
        // ---------------- Normalização do retorno ----------------
        return rows
            .map((d) => {
            const sim = typeof d.similarity === "number"
                ? d.similarity
                : typeof d.similaridade === "number"
                    ? d.similaridade
                    : undefined;
            const intensidadeNum = typeof d.intensidade === "number"
                ? d.intensidade
                : d.intensidade != null
                    ? Number(d.intensidade)
                    : undefined;
            return {
                resumo_eco: d.resumo_eco,
                tags: d.tags ?? undefined,
                emocao_principal: d.emocao_principal ?? undefined,
                intensidade: Number.isFinite(intensidadeNum) ? intensidadeNum : undefined,
                created_at: d.created_at,
                similarity: sim,
                distancia: typeof sim === "number" ? 1 - sim : undefined,
            };
        })
            .filter((x) => (x.similarity ?? 0) >= match_threshold)
            .slice(0, k);
    }
    catch (e) {
        console.error("❌ Erro interno ao buscar referências:", e?.message ?? e);
        return [];
    }
}
// alias compat
exports.buscarReferenciasSemelhantesV2 = buscarReferenciasSemelhantes;
//# sourceMappingURL=buscarReferenciasSemelhantes.js.map