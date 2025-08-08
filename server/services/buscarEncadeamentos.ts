import { createClient } from '@supabase/supabase-js';
import { embedTextoCompleto } from './embeddingService';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Tipo esperado do resultado da função RPC
type MemoriaEncadeada = {
  id: string;
  referencia_anterior_id: string | null;
  nivel: number;
};

/**
 * Busca memórias encadeadas a partir de uma entrada textual
 */
export async function buscarEncadeamentosPassados(userId: string, entrada: string): Promise<MemoriaEncadeada[]> {
  try {
    if (!entrada.trim()) return [];

    // Passo 1: gerar embedding da entrada
    const queryEmbedding = await embedTextoCompleto(entrada, '🔗 encadeamento');

    // Passo 2: buscar memória mais similar do usuário
    const { data: similares, error: erroSimilaridade } = await supabase.rpc('buscar_memorias_semelhantes', {
      consulta_embedding: queryEmbedding,
      filtro_usuario: userId,
      limite: 1
    });

    if (erroSimilaridade) {
      console.error('❌ Erro ao buscar memória mais similar:', erroSimilaridade.message);
      return [];
    }

    if (!similares || similares.length === 0) {
      console.warn('⚠️ Nenhuma memória similar encontrada.');
      return [];
    }

    const memoriaBaseId = similares[0].id;

    // Passo 3: buscar encadeamento a partir da memória mais parecida
    const { data: encadeamento, error: erroEncadeamento } = await supabase.rpc<MemoriaEncadeada[]>('buscar_encadeamentos_memorias', {
      raiz_id: memoriaBaseId
    });

    if (erroEncadeamento) {
      console.error('❌ Erro ao buscar encadeamento:', erroEncadeamento.message);
      return [];
    }

    return encadeamento || [];
  } catch (e) {
    console.error('❌ Erro inesperado ao buscar encadeamento:', (e as Error).message);
    return [];
  }
}
