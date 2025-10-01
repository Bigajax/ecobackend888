// services/buscarMemorias.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseDefault } from "../lib/supabaseAdmin"; // ✅ renomeado
import { prepareQueryEmbedding } from "./prepareQueryEmbedding";

export interface MemoriaSimilar {
  id: string;
  resumo_eco: string;
  tags?: string[];
  emocao_principal?: string;
  intensidade?: number;
  created_at?: string;
  similarity?: number;   // v2
  distancia?: number;    // v2 (1 - similarity)
}

export type BuscarMemsOpts = {
  texto?: string;                 // usado se não houver userEmbedding
  userEmbedding?: number[];       // se vier, não recalcula (normaliza!)
  k?: number;                     // default 4
  threshold?: number;             // default 0.80 (similaridade ∈ [0..1])
  daysBack?: number | null;       // default 30; null = sem filtro; usamos fallback
  userId?: string | null;         // se não vier, busca global (todas as memórias salvas)
  supabaseClient?: SupabaseClient; // ✅ novo: permite injeção de client
};

/**
 * Busca memórias semelhantes usando a RPC v2 com fallback de janela temporal.
 * Compatível com:
 *   buscarMemoriasSemelhantes(userId, "texto")
 *   buscarMemoriasSemelhantes(userId, { userEmbedding, k: 4, threshold: 0.8, supabaseClient })
 */
export async function buscarMemoriasSemelhantes(
  userIdOrNull: string | null,
  entradaOrOpts: string | BuscarMemsOpts
): Promise<MemoriaSimilar[]> {
  try {
    // ---------------------------
    // Normalização de parâmetros
    // ---------------------------
    let texto = "";
    let userEmbedding: number[] | undefined;
    let k = 4;
    let threshold = 0.8;        // ✅ default mais útil
    let daysBack: number | null = 30;
    let userId: string | null = userIdOrNull;
    let supabaseClient: SupabaseClient | undefined;

    if (typeof entradaOrOpts === "string") {
      texto = entradaOrOpts ?? "";
    } else {
      texto = entradaOrOpts.texto ?? "";
      userEmbedding = entradaOrOpts.userEmbedding;
      const requestedK =
        typeof entradaOrOpts.k === "number" ? Math.max(1, entradaOrOpts.k) : 4;
      k = Math.min(requestedK, 4); // LATENCY: top_k
      threshold =
        typeof entradaOrOpts.threshold === "number" ? entradaOrOpts.threshold : threshold;
      daysBack =
        typeof entradaOrOpts.daysBack === "number" || entradaOrOpts.daysBack === null
          ? entradaOrOpts.daysBack
          : daysBack;
      if (typeof entradaOrOpts.userId === "string") userId = entradaOrOpts.userId;
      supabaseClient = entradaOrOpts.supabaseClient; // ✅ injetado (se vier)
    }
    k = Math.min(Math.max(1, k), 4); // LATENCY: top_k

    // Client a usar
    const sb = supabaseClient ?? supabaseDefault; // ✅ preferir injetado

    // Guarda: se não veio embedding e o texto é muito curto, evita custo
    if (!userEmbedding && (!texto || texto.trim().length < 6)) return [];

    // ---------------------------
    // Gera OU reaproveita o embedding (e normaliza)
    // ---------------------------
    const queryEmbedding = await prepareQueryEmbedding({ texto, userEmbedding });
    if (!queryEmbedding) return [];

    const match_count = Math.max(1, k); // LATENCY: top_k
    const match_threshold = Math.max(0, Math.min(1, Number(threshold) || 0.8));

    // Helper para chamar a RPC v2 com days_back variável
    const call = async (db: number | null) => {
      const { data, error } = await sb.rpc(
        "buscar_memorias_semelhantes_v2",
        {
          query_embedding: queryEmbedding,  // float8[] / vector
          user_id_input: userId,            // uuid ou null (busca global se null)
          match_count,
          match_threshold,
          days_back: db,                    // inteiro (dias) ou null
        } as any // <- se seu tipo gerado não estiver atualizado
      );
      if (error) {
        console.warn("⚠️ RPC buscar_memorias_semelhantes_v2 falhou:", {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
        });
        return [] as any[];
      }
      return (data ?? []) as any[];
    };

    // ---------------------------
    // Estratégia de fallback: 30d → 180d → sem filtro
    // ---------------------------
    let rows: any[] = [];
    const tryOrder: (number | null)[] =
      daysBack === null ? [null] : [daysBack ?? 30, 180, null];

    for (const db of tryOrder) {
      rows = await call(db);
      if (rows && rows.length) break;
    }

    // Normaliza resultado para o shape da app
    return rows
      .map((d) => ({
        id: d.id as string,
        resumo_eco: d.resumo_eco as string,
        tags: d.tags ?? undefined,
        emocao_principal: d.emocao_principal ?? undefined,
        intensidade:
          typeof d.intensidade === "number"
            ? d.intensidade
            : d.intensidade != null
            ? Number(d.intensidade)
            : undefined,
        created_at: d.created_at as string | undefined,
        similarity:
          typeof d.similarity === "number"
            ? d.similarity
            : typeof d.similaridade === "number"
            ? d.similaridade
            : undefined,
        distancia:
          typeof d.distancia === "number"
            ? d.distancia
            : typeof d.similarity === "number"
            ? 1 - d.similarity
            : undefined,
      }))
      .slice(0, k);
  } catch (e) {
    console.error("❌ Erro interno ao buscar memórias:", (e as Error).message);
    return [];
  }
}

