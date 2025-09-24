"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buscarReferenciasSemelhantesV2 = void 0;
exports.buscarReferenciasSemelhantes = buscarReferenciasSemelhantes;
// services/buscarReferenciasSemelhantes.ts
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
const embeddingService_1 = require("./embeddingService");
async function buscarReferenciasSemelhantes(userId, entradaOrOpts) {
    // ---------------------------
    // Normalização de parâmetros
    // ---------------------------
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
    // ---------------------------
    // Embedding (gera OU reaproveita) + normalização
    // ---------------------------
    const queryEmbedding = userEmbedding?.length
        ? (0, embeddingService_1.unitNorm)(userEmbedding)
        : (0, embeddingService_1.unitNorm)(await (0, embeddingService_1.embedTextoCompleto)(texto, "refs"));
    const match_count = Math.max(1, k);
    const match_threshold = Math.max(0, Math.min(1, Number(threshold) || 0.8));
    // ---------------------------
    // RPC existente: buscar_referencias_similares
    // ---------------------------
    const { data, error } = await supabaseAdmin_1.supabaseAdmin.rpc("buscar_referencias_similares", {
        filtro_usuario: userId,
        query_embedding: queryEmbedding,
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
    // ---------------------------
    // Normalização do retorno
    // ---------------------------
    return rows
        .map((d) => {
        const sim = typeof d.similarity === "number"
            ? d.similarity
            : typeof d.similaridade === "number"
                ? d.similaridade
                : undefined;
        return {
            resumo_eco: d.resumo_eco,
            tags: d.tags ?? undefined,
            emocao_principal: d.emocao_principal ?? undefined,
            intensidade: typeof d.intensidade === "number" ? d.intensidade : Number(d.intensidade),
            created_at: d.created_at,
            similarity: sim,
            distancia: typeof sim === "number" ? 1 - sim : undefined,
        };
    })
        .filter((x) => (x.similarity ?? 0) >= match_threshold)
        .slice(0, k);
}
// alias compat com seu código anterior V2 (se algum lugar importar V2)
exports.buscarReferenciasSemelhantesV2 = buscarReferenciasSemelhantes;
//# sourceMappingURL=buscarReferenciasSemelhantes.js.map