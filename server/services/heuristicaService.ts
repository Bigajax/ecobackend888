import { supabaseAdmin } from "../lib/supabaseAdmin";
import { embedTextoCompleto } from "./embeddingService";

/**
 * Busca heurísticas semânticas semelhantes usando embeddings.
 * @param texto Texto de entrada para gerar o embedding.
 * @param threshold Limite de similaridade (default: 0.75).
 * @param matchCount Quantidade de heurísticas retornadas (default: 5).
 */
export async function buscarHeuristicasSemelhantes(
  texto: string,
  threshold = 0.75,
  matchCount = 5
) {
  try {
    const query_embedding = await embedTextoCompleto(texto, "🔍 heuristica");

    const { data, error } = await supabaseAdmin.rpc("buscar_heuristica_semelhante", {
      query_embedding,
      match_threshold: threshold,
      match_count: matchCount
    });

    if (error) {
      console.error("❌ Erro RPC heurística:", error.message);
      return [];
    }

    // 🔍 Filtra apenas heurísticas cognitivas e filosóficas
    return data.filter((item: any) =>
      ['cognitiva', 'filosofico'].includes(item.tipo)
    );
  } catch (err) {
    console.error("❌ Erro ao gerar embedding ou buscar heurísticas:", err);
    return [];
  }
}
