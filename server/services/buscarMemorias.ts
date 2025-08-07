import { embedTextoCompleto } from './embeddingService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

/**
 * Busca memórias semanticamente semelhantes no Supabase
 */
export async function buscarMemoriasSemelhantes(userId: string, entrada: string) {
  if (!entrada || !userId) return [];

  try {
    const consulta_embedding = await embedTextoCompleto(entrada, 'entrada_usuario');

    const { data, error } = await supabaseAdmin.rpc('buscar_memorias_semelhantes', {
      consulta_embedding,
      filtro_usuario: userId,
      limite: 6
    });

    if (error) {
      console.error('❌ Erro ao buscar memórias semelhantes:', error.message);
      return [];
    }

    return data || [];
  } catch (e) {
    console.error('❌ Erro interno ao buscar memórias:', (e as Error).message);
    return [];
  }
}
