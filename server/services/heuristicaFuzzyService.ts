import { embedTextoCompleto } from './embeddingService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export async function buscarHeuristicaPorSimilaridade(mensagem: string) {
  const queryEmbedding = await embedTextoCompleto(mensagem, 'entrada_usuario');

  const { data, error } = await supabaseAdmin.rpc('buscar_heuristica_semelhante', {
    query_embedding: queryEmbedding,
    match_threshold: 0.83, // ajuste conforme necessário
    match_count: 1
  });

  if (error) {
    console.error('Erro na busca fuzzy de heurística:', error.message);
    return null;
  }

  return data?.[0] || null;
}
