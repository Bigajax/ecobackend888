import { supabaseAdmin } from "../lib/supabaseAdmin";
import { embedTextoCompleto } from "./embeddingService";

/** Formato das heurísticas retornadas */
interface Heuristica {
  id: string;
  arquivo: string;
  embedding: number[];
  tags?: string[];
  tipo: string;
  origem?: string;
  usuario_id?: string | null;
  similaridade: number;
}

/** Assinatura nova (opcional) por objeto */
type BuscarHeuristicasInput = {
  texto?: string;
  usuarioId?: string | null;
  userEmbedding?: number[];   // ✅ se vier, não recalcula
  threshold?: number;
  matchCount?: number;
};

/**
 * Busca heurísticas semânticas semelhantes usando embeddings.
 * Compatível com a assinatura antiga (string) e nova (objeto).
 *
 * Antigo:
 *   buscarHeuristicasSemelhantes("texto", userId, 0.75, 5)
 *
 * Novo:
 *   buscarHeuristicasSemelhantes({ userEmbedding, usuarioId: userId, matchCount: 5 })
 */
export async function buscarHeuristicasSemelhantes(
  input: string | BuscarHeuristicasInput,
  usuarioId?: string | null,
  threshold = 0.75,
  matchCount = 5
): Promise<Heuristica[]> {
  try {
    // ---------------------------
    // Normalização de parâmetros
    // ---------------------------
    let texto = "";
    let userEmbedding: number[] | undefined;
    let uid: string | null = null;
    let th = threshold;
    let k = matchCount;

    if (typeof input === "string") {
      // MODO ANTIGO
      texto = input ?? "";
      uid = usuarioId ?? null;
      th = threshold ?? 0.75;
      k = matchCount ?? 5;
    } else {
      // MODO NOVO (objeto)
      texto = input.texto ?? "";
      userEmbedding = input.userEmbedding;
      uid = input.usuarioId ?? null;
      th = input.threshold ?? 0.75;
      k = input.matchCount ?? 5;
    }

    // ---------------------------------
    // Guard clause para texto muito curto
    // ---------------------------------
    if (!userEmbedding && (!texto || texto.trim().length < 6)) {
      console.warn("⚠️ Texto curto e nenhum embedding fornecido — pulando busca de heurísticas.");
      return [];
    }

    // ---------------------------------
    // Gera OU reaproveita o embedding
    // ---------------------------------
    const query_embedding =
      Array.isArray(userEmbedding) && userEmbedding.length > 0
        ? userEmbedding
        : await embedTextoCompleto(texto, "🔍 heuristica");

    if (!query_embedding || !Array.isArray(query_embedding)) {
      console.error("❌ Embedding gerado inválido.");
      return [];
    }

    // ---------------------------------
    // RPC (nomes dos parâmetros devem bater com a função SQL)
    // ---------------------------------
    const response = await supabaseAdmin.rpc("buscar_heuristica_semelhante", {
      query_embedding,          // vector
      match_threshold: th,      // number
      match_count: k,           // number
      input_usuario_id: uid     // uuid ou null
    });

    if (response.error) {
      console.error("❌ Erro RPC heurística:", response.error.message);
      return [];
    }

    const data = (response.data as Heuristica[] | null) ?? [];

    // Filtra apenas os tipos desejados (ajuste se quiser incluir mais)
    return data.filter((item) => ["cognitiva", "filosofico"].includes(item.tipo));
  } catch (err) {
    console.error(
      "❌ Erro inesperado ao gerar/usar embedding ou buscar heurísticas:",
      (err as Error).message
    );
    return [];
  }
}
