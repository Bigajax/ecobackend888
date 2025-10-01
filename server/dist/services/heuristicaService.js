"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buscarHeuristicasSemelhantes = buscarHeuristicasSemelhantes;
exports.buscarHeuristicaPorSimilaridade = buscarHeuristicaPorSimilaridade;
// services/heuristicaService.ts
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
const supabaseAdmin_2 = __importDefault(require("../lib/supabaseAdmin")); // para o hydrate simples do segundo helper
const embeddingService_1 = require("../adapters/embeddingService");
const prepareQueryEmbedding_1 = require("./prepareQueryEmbedding");
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
/** Implementação core: recebe já o embedding normalizado e executa a RPC + hydrate opcional */
async function _buscarHeuristicasCore(params) {
    const { queryEmbedding, usuarioId, threshold, matchCount, hydrate } = params;
    const { data, error } = await supabaseAdmin_1.supabase.rpc("buscar_heuristica_semelhante", {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: matchCount,
        input_usuario_id: usuarioId,
    });
    if (error) {
        console.error("❌ RPC buscar_heuristica_semelhante:", error.message);
        return [];
    }
    const base = (data ?? []);
    if (!hydrate || base.length === 0)
        return base;
    const ids = base.map((r) => r.id);
    const { data: metas, error: metaErr } = await supabaseAdmin_1.supabase
        .from("heuristicas_embeddings")
        .select("id, arquivo, tipo, origem, tags, usuario_id")
        .in("id", ids);
    if (metaErr) {
        console.warn("⚠️ Falha ao hidratar metadados de heurísticas:", metaErr.message);
        return base;
    }
    const idx = new Map((metas ?? []).map((m) => [m.id, m]));
    return base.map((r) => ({ ...r, ...(idx.get(r.id) ?? {}) }));
}
/** API rica (objeto ou string), mantém compat com sua chamada atual */
async function buscarHeuristicasSemelhantes(input, usuarioIdArg, thresholdArg = 0.8, matchCountArg = 4) {
    // normalização de parâmetros
    let texto = "";
    let userEmbedding;
    let usuarioId = null;
    let threshold = clamp01(Number(thresholdArg) || 0.8);
    let matchCount = Math.max(1, Number(matchCountArg) || 4);
    let hydrate = true;
    if (typeof input === "string") {
        texto = input ?? "";
        usuarioId = usuarioIdArg ?? null;
    }
    else {
        texto = input.texto ?? "";
        userEmbedding = input.userEmbedding;
        usuarioId = input.usuarioId ?? null;
        if (typeof input.threshold === "number")
            threshold = clamp01(input.threshold);
        if (typeof input.matchCount === "number")
            matchCount = Math.max(1, input.matchCount);
        if (typeof input.hydrate === "boolean")
            hydrate = input.hydrate;
    }
    if (!userEmbedding && (!texto || texto.trim().length < 6))
        return [];
    // gera ou reaproveita embedding
    const queryEmbedding = await (0, prepareQueryEmbedding_1.prepareQueryEmbedding)({
        texto,
        userEmbedding,
        tag: "🔍 heuristica",
    });
    if (!queryEmbedding)
        return [];
    matchCount = Math.min(Math.max(1, matchCount), 4); // LATENCY: top_k
    return _buscarHeuristicasCore({
        queryEmbedding,
        usuarioId,
        threshold,
        matchCount,
        hydrate,
    });
}
/** API simples (mensagem + log) — mantém comportamento do seu segundo bloco */
async function buscarHeuristicaPorSimilaridade(mensagem, usuarioId, threshold = 0.83, matchCount = 3) {
    if (!mensagem?.trim())
        return [];
    const queryEmbedding = (0, embeddingService_1.unitNorm)(await (0, embeddingService_1.embedTextoCompleto)(mensagem, "entrada_usuario"));
    const resultados = await _buscarHeuristicasCore({
        queryEmbedding,
        usuarioId: usuarioId ?? null,
        threshold: clamp01(threshold),
        matchCount: Math.min(Math.max(1, matchCount), 4), // LATENCY: top_k
        hydrate: false, // hidrataremos só arquivo para log
    });
    if (!resultados.length) {
        console.log("ℹ️ Nenhuma heurística fuzzy encontrada acima do threshold.");
        return [];
    }
    const ids = resultados.map((r) => r.id);
    const { data: metas } = await supabaseAdmin_2.default
        .from("heuristicas_embeddings")
        .select("id, arquivo")
        .in("id", ids);
    const idx = new Map((metas ?? []).map((m) => [m.id, m]));
    console.log(`✅ ${resultados.length} heurística(s) fuzzy encontradas:`);
    resultados.forEach((r, i) => {
        const arq = idx.get(r.id)?.arquivo ?? "(sem arquivo)";
        console.log(`• #${i + 1}: ${arq} (similarity: ${r.similarity.toFixed(3)})`);
    });
    return resultados.map((r) => ({ ...r, arquivo: idx.get(r.id)?.arquivo ?? null }));
}
//# sourceMappingURL=heuristicaService.js.map