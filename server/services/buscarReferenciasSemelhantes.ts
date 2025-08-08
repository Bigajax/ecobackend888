import { supabaseAdmin } from '../lib/supabaseAdmin';
import { embedTextoCompleto } from './embeddingService';

interface ReferenciaTemporaria {
  resumo_eco: string;
  tags?: string[];
  emocao_principal?: string;
  intensidade?: number;
  similaridade: number;
  created_at?: string;
}

export async function buscarReferenciasSemelhantes(
  userId: string,
  entrada: string
): Promise<ReferenciaTemporaria[]> {
  try {
    if (!entrada?.trim()) return [];

    const query_embedding = await embedTextoCompleto(entrada, 'referencia');

    if (!query_embedding || !Array.isArray(query_embedding)) {
      console.error('❌ Vetor de embedding inválido.');
      return [];
    }

    const { data, error } = await supabaseAdmin.rpc('buscar_referencias_similares', {
      match_count: 5,
      match_threshold: 0.75,
      query_embedding,
      filtro_usuario: userId  // ✅ Nome correto aqui
    });

    if (error) {
      console.error('❌ Erro ao buscar referências similares via RPC:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('❌ Erro inesperado ao buscar referências semelhantes:', (err as Error).message);
    return [];
  }
}
