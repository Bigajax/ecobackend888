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

// Opções para reaproveitar embedding e controlar limites
type BuscarEncadeamentosOpts = {
  texto?: string;            // usado se não houver userEmbedding
  userEmbedding?: number[];  // ✅ se vier, NÃO recalcula
  kBase?: number;            // quantas memórias-base procurar (default 1)
};

export async function buscarEncadeamentosPassados(
  userId: string,
  entradaOrOpts: string | BuscarEncadeamentosOpts
): Promise<MemoriaEncadeada[]> {
  try {
    if (!userId) return [];

    // ---------------------------
    // Normalização de parâmetros
    // ---------------------------
    let texto = '';
    let userEmbedding: number[] | undefined;
    let kBase = 1;

    if (typeof entradaOrOpts === 'string') {
      texto = entradaOrOpts ?? '';
    } else {
      texto = entradaOrOpts.texto ?? '';
      userEmbedding = entradaOrOpts.userEmbedding;
      kBase = typeof entradaOrOpts.kBase === 'number' ? entradaOrOpts.kBase : 1;
    }

    // Evita custo se não tiver embedding e o texto for muito curto
    if (!userEmbedding && (!texto || texto.trim().length < 6)) {
      console.warn('⚠️ Entrada muito curta e sem embedding — pulando encadeamento.');
      return [];
    }

    // ---------------------------
    // Gera OU reaproveita o embedding
    // ---------------------------
    const consulta_embedding =
      Array.isArray(userEmbedding) && userEmbedding.length > 0
        ? userEmbedding
        : await embedTextoCompleto(texto, '🔗 encadeamento');

    if (!Array.isArray(consulta_embedding) || consulta_embedding.length === 0) {
      console.error('❌ Embedding inválido para encadeamento.');
      return [];
    }

    // ---------------------------
    // 1) Busca memória base mais similar do usuário
    // ---------------------------
    const { data: similares, error: erroSimilaridade } = await supabase.rpc(
      'buscar_memorias_semelhantes',
      {
        consulta_embedding,
        filtro_usuario: userId,
        limite: Math.max(1, kBase),
      }
    );

    if (erroSimilaridade) {
      console.error('❌ Erro ao buscar memória mais similar:', erroSimilaridade.message);
      return [];
    }

    if (!similares || similares.length === 0) {
      console.warn('⚠️ Nenhuma memória similar encontrada para o encadeamento.');
      return [];
    }

    // Pode encadear a partir da primeira (ou de todas, se quiser no futuro)
    const memoriaBaseId = similares[0].id as string | undefined;
    if (!memoriaBaseId) {
      console.warn('⚠️ Memória similar sem id — abortando encadeamento.');
      return [];
    }

    // ---------------------------
    // 2) Busca encadeamento recursivo a partir da memória encontrada
    // ---------------------------
    const { data: encadeamentos, error: erroEncadeamento } = await supabase.rpc(
      'buscar_encadeamentos_memorias',
      { raiz_id: memoriaBaseId }
    );

    if (erroEncadeamento) {
      console.error('❌ Erro ao buscar encadeamentos:', erroEncadeamento.message);
      return [];
    }

    return (encadeamentos as MemoriaEncadeada[]) ?? [];
  } catch (e) {
    console.error('❌ Erro inesperado ao buscar encadeamentos:', (e as Error).message);
    return [];
  }
}
