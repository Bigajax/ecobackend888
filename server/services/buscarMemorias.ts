import { embedTextoCompleto } from "./embeddingService";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface MemoriaSimilar {
  id?: string;
  resumo_eco: string;
  tags?: string[];
  emocao_principal?: string;
  intensidade?: number;
  similaridade?: number;     // mapeada de similaridade_total/similarity
  created_at?: string;
}

type BuscarMemsOpts = {
  texto?: string;            // se não tiver embedding, usa isso pra gerar
  userEmbedding?: number[];  // se vier, NÃO recalcula
  k?: number;                // default 6
  threshold?: number;        // default 0
  userId?: string | null;    // opcional: se passar aqui, já filtramos por usuário
};

/**
 * Busca memórias semanticamente semelhantes.
 * Compatível com:
 *   buscarMemoriasSemelhantes(userId, "texto")
 *   buscarMemoriasSemelhantes(userId, { userEmbedding, k: 6, threshold: 0.7 })
 */
export async function buscarMemoriasSemelhantes(
  userIdOrNull: string | null,
  entradaOrOpts: string | BuscarMemsOpts
): Promise<MemoriaSimilar[]> {
  try {
    // Normaliza parâmetros
    let texto = "";
    let userEmbedding: number[] | undefined;
    let k = 6;
    let threshold = 0;
    let userId: string | null = userIdOrNull;

    if (typeof entradaOrOpts === "string") {
      texto = entradaOrOpts ?? "";
    } else {
      texto = entradaOrOpts.texto ?? "";
      userEmbedding = entradaOrOpts.userEmbedding;
      k = typeof entradaOrOpts.k === "number" ? entradaOrOpts.k : 6;
      threshold = typeof entradaOrOpts.threshold === "number" ? entradaOrOpts.threshold : 0;
      if (typeof entradaOrOpts.userId === "string") userId = entradaOrOpts.userId;
    }

    // Se não veio embedding e o texto é muito curto, evita custo
    if (!userEmbedding && (!texto || texto.trim().length < 6)) {
      return [];
    }

    // Gera OU reaproveita o embedding (parse defensivo)
    let consultaEmbedding: number[] | undefined = userEmbedding;
    if (!consultaEmbedding) {
      const raw = await embedTextoCompleto(texto);
      consultaEmbedding = Array.isArray(raw) ? raw : JSON.parse(String(raw));
      if (!Array.isArray(consultaEmbedding)) {
        console.error("❌ Embedding inválido para busca de memórias.");
        return [];
      }
    }

    // Sanitiza threshold (0..1)
    const matchThreshold = Math.max(0, Math.min(1, Number(threshold) || 0));

    // 🔄 RPC (nomes exatamente como no SQL)
    const { data, error } = await supabaseAdmin.rpc("buscar_memorias_semelhantes", {
      query_embedding: consultaEmbedding,  // vector
      user_id_input: userId,               // uuid ou null
      match_count: Math.max(1, k),         // int
      match_threshold: matchThreshold      // double precision
    });

    if (error) {
      console.warn("⚠️ RPC buscar_memorias_semelhantes falhou:", {
        message: error.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint
      });
      return [];
    }

    // Normaliza campos de similaridade
    const itens = (data ?? []) as any[];
    return itens.map((d) => ({
      id: d.id,
      resumo_eco: d.resumo_eco,
      created_at: d.created_at,
      similaridade:
        typeof d.similaridade_total === "number"
          ? d.similaridade_total
          : typeof d.similaridade === "number"
            ? d.similaridade
            : typeof d.similarity === "number"
              ? d.similarity
              : undefined,
      tags: d.tags,
      emocao_principal: d.emocao_principal,
      intensidade: d.intensidade,
    })) as MemoriaSimilar[];
  } catch (e) {
    console.error("❌ Erro interno ao buscar memórias:", (e as Error).message);
    return [];
  }
}
