import { embedTextoCompleto } from './embeddingService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

interface MemoriaSimilar {
  id?: string;
  resumo_eco: string;
  tags?: string[];
  emocao_principal?: string;
  intensidade?: number;
  similaridade?: number;     // mapeada de similaridade_total
  created_at?: string;
}

type BuscarMemsOpts = {
  texto?: string;            // se não tiver embedding, usa isso pra gerar
  userEmbedding?: number[];  // se vier, NÃO recalcula
  k?: number;                // default 6 (equivale ao "limite")
  threshold?: number;        // default 0 (ex.: 0.7 para filtrar)
};

/**
 * Busca memórias semanticamente semelhantes no Supabase.
 *
 * Compatível com:
 *   buscarMemoriasSemelhantes(userId, "texto")
 *   buscarMemoriasSemelhantes(userId, { userEmbedding, k: 6, threshold: 0.7 })
 *
 * Mapeia 1:1 para a função SQL:
 * public.buscar_memorias_semelhantes(
 *   query_embedding vector,
 *   user_id_input uuid,
 *   match_count int,
 *   match_threshold double precision DEFAULT 0
 * )
 */
export async function buscarMemoriasSemelhantes(
  userId: string | null,
  entradaOrOpts: string | BuscarMemsOpts
): Promise<MemoriaSimilar[]> {
  try {
    // Normaliza parâmetros
    let texto = '';
    let userEmbedding: number[] | undefined;
    let k = 6;
    let threshold = 0;

    if (typeof entradaOrOpts === 'string') {
      texto = entradaOrOpts ?? '';
    } else {
      texto = entradaOrOpts.texto ?? '';
      userEmbedding = entradaOrOpts.userEmbedding;
      k = typeof entradaOrOpts.k === 'number' ? entradaOrOpts.k : 6;
      threshold = typeof entradaOrOpts.threshold === 'number' ? entradaOrOpts.threshold : 0;
    }

    // Se não veio embedding e o texto é muito curto, evita custo
    if (!userEmbedding && (!texto || texto.trim().length < 6)) {
      return [];
    }

    // Gera OU reaproveita o embedding
    const consultaEmbedding =
      Array.isArray(userEmbedding) && userEmbedding.length > 0
        ? userEmbedding
        : await embedTextoCompleto(texto, 'entrada_usuario');

    if (!Array.isArray(consultaEmbedding) || consultaEmbedding.length === 0) {
      console.error('❌ Embedding inválido para busca de memórias.');
      return [];
    }

    // Sanitiza threshold (0..1)
    const matchThreshold = Math.max(0, Math.min(1, Number(threshold) || 0));

    // 🔄 Chamada RPC com nomes exatamente iguais aos do SQL
    const { data, error } = await supabaseAdmin.rpc('buscar_memorias_semelhantes', {
      query_embedding: consultaEmbedding,  // vector
      user_id_input: userId,               // uuid (pode ser null; SQL filtrará)
      match_count: k,                      // int
      match_threshold: matchThreshold      // double precision
    });

    if (error) {
      console.warn('⚠️ RPC buscar_memorias_semelhantes falhou:', {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint
      });
      return [];
    }

    // Mapeia similaridade_total -> similaridade (mantém interface)
    const itens = (data ?? []) as any[];
    return itens.map((d) => ({
      id: d.id,
      resumo_eco: d.resumo_eco,
      created_at: d.created_at,
      similaridade: typeof d.similaridade_total === 'number' ? d.similaridade_total : undefined,
      // campos opcionais caso sua função venha a retornar no futuro
      tags: d.tags,
      emocao_principal: d.emocao_principal,
      intensidade: d.intensidade,
    })) as MemoriaSimilar[];
  } catch (e) {
    console.error('❌ Erro interno ao buscar memórias:', (e as Error).message);
    return [];
  }
}
