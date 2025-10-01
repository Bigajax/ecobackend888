"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buscarHeuristicasSemelhantes = buscarHeuristicasSemelhantes;
const supabaseAdmin_1 = __importDefault(require("../../lib/supabaseAdmin")); // ✅ default import
const embeddingService_1 = require("../../adapters/embeddingService");
async function buscarHeuristicasSemelhantes(texto) {
    // gera embedding
    const query_embedding = await (0, embeddingService_1.embedTextoCompleto)(texto, "🔍 heuristica");
    // chamada direta (sem precisar stringify)
    const { data, error } = await supabaseAdmin_1.default.rpc("buscar_heuristica_semelhante", {
        query_embedding, // array number[] vai direto
        match_threshold: 0.8,
        match_count: 3,
        input_usuario_id: null, // se quiser permitir filtro opcional
    });
    if (error) {
        console.error("❌ Erro ao buscar heurísticas semelhantes:", error.message);
        return [];
    }
    return data ?? [];
}
//# sourceMappingURL=carregarHeuristicasComoEmbedding.js.map