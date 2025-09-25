import supabase from "../../lib/supabaseAdmin"; // ✅ default import
import { embedTextoCompleto } from "../../services/embeddingService";

export async function buscarHeuristicasSemelhantes(texto: string) {
  // gera embedding
  const query_embedding = await embedTextoCompleto(texto, "🔍 heuristica");

  // chamada direta (sem precisar stringify)
  const { data, error } = await supabase.rpc("buscar_heuristica_semelhante", {
    query_embedding,       // array number[] vai direto
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
