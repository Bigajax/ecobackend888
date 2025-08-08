import { embedTextoCompleto } from './embeddingService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

interface MemoriaSimilar {
  id?: string;
  resumo_eco: string;
  tags?: string[];
  emocao_principal?: string;
  intensidade?: number;
  similaridade?: number;
  created_at?: string;
}

type BuscarMemsOpts = {
  texto?: string;           // se não tiver embedding, usa isso pra gerar
  userEmbedding?: number[]; // ✅ se vier, NÃO recalcula
  k?: number;               // default 6 (mantém seu 'limite')
};

/**
 * Busca memórias semanticamente semelhantes no Supabase
 *
 * Compatível com a assinatura antiga:
 *   buscarMemoriasSemelhantes(userId, "texto")
 *
 * E com a assinatura nova (reaproveitando embedding):
 *   buscarMemoriasSemelhantes(userId, { userEmbedding, k: 6 })
 */
export async function buscarMemoriasSemelhantes(
  userId: string,
  entradaOrOpts: string | BuscarMemsOpts
): Promise<MemoriaSimilar[]> {
  try {
    if (!userId) return [];

    // Normaliza parâmetros
    let texto = '';
    let userEmbedding: number[] | undefined;
    let k = 6;

    if (typeof entradaOrOpts === 'string') {
      texto = entradaOrOpts ?? '';
    } else {
      texto = entradaOrOpts.texto ?? '';
      userEmbedding = entradaOrOpts.userEmbedding;
      k = typeof entradaOrOpts.k === 'number' ? entradaOrOpts.k : 6;
    }

    // Se não veio embedding e o texto é muito curto, evita custo
    if (!userEmbedding && (!texto || texto.trim().length < 6)) {
      return [];
    }

    // Gera OU reaproveita o embedding
    const consulta_embedding =
      Array.isArray(userEmbedding) && userEmbedding.length > 0
        ? userEmbedding
        : await embedTextoCompleto(texto, 'entrada_usuario');

    if (!Array.isArray(consulta_embedding) || consulta_embedding.length === 0) {
      console.error('❌ Embedding inválido para busca de memórias.');
      return [];
    }

    // Chamada RPC mantendo seus nomes de parâmetros atuais
    const { data, error } = await supabaseAdmin.rpc('buscar_memorias_semelhantes', {
      consulta_embedding,
      filtro_usuario: userId,
      limite: k,
    });

    if (error) {
      console.error('❌ Erro ao buscar memórias semelhantes:', error.message);
      return [];
    }

    return (data as MemoriaSimilar[]) ?? [];
  } catch (e) {
    console.error('❌ Erro interno ao buscar memórias:', (e as Error).message);
    return [];
  }
}
