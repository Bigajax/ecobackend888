import { createClient } from '@supabase/supabase-js';
import { embedTextoCompleto } from './embeddingService';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export type MemoriaEncadeada = {
  id: string;
  referencia_anterior_id: string | null;
  created_at: string;
  resumo_eco: string;
};

export async function buscarEncadeamentosPassados(userId: string, entrada: string): Promise<MemoriaEncadeada[]> {
  try {
    if (!entrada || !entrada.trim()) {
      console.warn('⚠️ Entrada vazia ou inválida para encadeamento.');
      return [];
    }

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
      console.warn('⚠️ Nenhuma memória similar encontrada para o encadeamento.');
      return [];
    }

    const memoriaBaseId = similares[0].id;

    // Passo 3: buscar encadeamento recursivo a partir da memória encontrada
    const { data: encadeamentos, error: erroEncadeamento } = await supabase.rpc('buscar_encadeamentos_memorias', {
      raiz_id: memoriaBaseId
    });

    if (erroEncadeamento) {
      console.error('❌ Erro ao buscar encadeamentos:', erroEncadeamento.message);
      return [];
    }

    return (encadeamentos as MemoriaEncadeada[]) || [];
  } catch (e) {
    console.error('❌ Erro inesperado ao buscar encadeamentos:', (e as Error).message);
    return [];
  }
}
