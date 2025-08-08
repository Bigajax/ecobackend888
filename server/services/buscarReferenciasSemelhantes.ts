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

// Novo shape opcional para facilitar reuso de embedding
type BuscarRefsOpts = {
  texto?: string;
  userEmbedding?: number[];  // ✅ se vier, não recalcula
  k?: number;                 // default 5
  threshold?: number;         // default 0.75
};

/**
 * Buscar referências semelhantes.
 *
 * Compatível com a assinatura antiga:
 *   buscarReferenciasSemelhantes(userId, "texto")
 *
 * E com a assinatura nova (reaproveitando embedding):
 *   buscarReferenciasSemelhantes(userId, { userEmbedding, k: 5 })
 */
export async function buscarReferenciasSemelhantes(
  userId: string,
  entradaOrOpts: string | BuscarRefsOpts
): Promise<ReferenciaTemporaria[]> {
  try {
    // ---------------------------
    // Normalização de parâmetros
    // ---------------------------
    let texto = '';
    let userEmbedding: number[] | undefined;
    let k = 5;
    let threshold = 0.75;

    if (typeof entradaOrOpts === 'string') {
      texto = entradaOrOpts ?? '';
    } else {
      texto = entradaOrOpts.texto ?? '';
      userEmbedding = entradaOrOpts.userEmbedding;
      k = typeof entradaOrOpts.k === 'number' ? entradaOrOpts.k : 5;
      threshold = typeof entradaOrOpts.threshold === 'number' ? entradaOrOpts.threshold : 0.75;
    }

    // Guard clause: se não veio embedding e o texto é curto, não vale a pena
    if (!userEmbedding && (!texto || texto.trim().length < 6)) {
      return [];
    }

    // ---------------------------------
    // Gera OU reaproveita o embedding
    // ---------------------------------
    const query_embedding =
      Array.isArray(userEmbedding) && userEmbedding.length > 0
        ? userEmbedding
        : await embedTextoCompleto(texto, 'referencia');

    if (!Array.isArray(query_embedding) || query_embedding.length === 0) {
      console.error('❌ Vetor de embedding inválido.');
      return [];
    }

    // ---------------------------------
    // RPC — os nomes DEVEM bater com a função SQL
    // (ajuste se sua função usar parâmetros diferentes)
    // ---------------------------------
    const { data, error } = await supabaseAdmin.rpc('buscar_referencias_similares', {
      match_count: k,
      match_threshold: threshold,
      query_embedding,
      filtro_usuario: userId, // <- use o mesmo nome que está na sua função SQL
    });

    if (error) {
      console.error('❌ Erro ao buscar referências similares via RPC:', error.message);
      return [];
    }

    return (data as ReferenciaTemporaria[]) ?? [];
  } catch (err) {
    console.error('❌ Erro inesperado ao buscar referências semelhantes:', (err as Error).message);
    return [];
  }
}
