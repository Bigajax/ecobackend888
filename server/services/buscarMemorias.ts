// services/buscarMemorias.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
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
    const sb = supabaseClient ?? getSupabaseAdmin();
    if (!sb) {
      throw new Error("Supabase admin misconfigured");
    }

    // Guarda: se não veio embedding e o texto é muito curto, evita custo
    if (!userEmbedding && (!texto || texto.trim().length < 6)) return [];

    // ---------------------------
    // Gera OU reaproveita o embedding (e normaliza)
    // ---------------------------
    const queryEmbedding = await prepareQueryEmbedding({ texto, userEmbedding });
    if (!queryEmbedding) return [];

    if (!userId) {
      return [];
    }

    const match_count = Math.max(1, k); // LATENCY: top_k
    const match_threshold = Math.max(0, Math.min(1, Number(threshold) || 0.8));

    const { data, error } = await sb.rpc(
      "buscar_memorias_semanticas_v2",
      {
        p_usuario_id: userId,
        p_query: queryEmbedding,
        p_limit: match_count,
        p_lambda_mmr: 0.6,
        p_recency_halflife_hours:
          daysBack == null ? 48 : Math.max(1, Math.min(720, Math.round(Math.max(daysBack, 1) * 24))),
        p_token_budget: 1800,
        p_tags: [],
        p_emocao: null,
        p_include_referencias: true,
        p_query_emocional: null,
      } as Record<string, unknown>
    );

    if (error) {
      console.warn("⚠️ RPC buscar_memorias_semanticas_v2 falhou:", {
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      return [];
    }

    const rows = Array.isArray(data) ? (data as any[]) : [];

    return rows
      .filter((row) => {
        const score = typeof row?.effective_score === "number" ? Number(row.effective_score) : null;
        return score == null || score >= match_threshold;
      })
      .map((d) => {
        const similarity =
          typeof d.similarity_score === "number"
            ? Number(d.similarity_score)
            : typeof d.similarity === "number"
            ? Number(d.similarity)
            : undefined;
        const intensityValue =
          typeof d.intensidade === "number"
            ? Number(d.intensidade)
            : d.intensidade != null
            ? Number(d.intensidade)
            : undefined;
        const memoriaId =
          typeof d.memoria_id === "string" && d.memoria_id.trim().length > 0
            ? d.memoria_id
            : typeof d.id === "string" && d.id.trim().length > 0
            ? d.id
            : null;
        if (!memoriaId) return null;
        return {
          id: memoriaId,
          resumo_eco: typeof d.resumo_eco === "string" ? d.resumo_eco : "",
          tags: Array.isArray(d.tags) ? d.tags : undefined,
          emocao_principal: d.emocao_principal ?? undefined,
          intensidade: intensityValue,
          created_at: typeof d.created_at === "string" ? d.created_at : undefined,
          similarity,
          distancia: typeof similarity === "number" ? Math.max(0, 1 - similarity) : undefined,
        };
      })
      .filter((entry): entry is {
        id: string;
        resumo_eco: string;
        tags?: string[];
        emocao_principal?: string;
        intensidade?: number;
        created_at?: string;
        similarity?: number;
        distancia?: number;
      } => Boolean(entry))
      .slice(0, k);
  } catch (e) {
    console.error("❌ Erro interno ao buscar memórias:", (e as Error).message);
    return [];
  }
}

export const buscarMemoriasSemelhantesV2 = buscarMemoriasSemelhantes;

