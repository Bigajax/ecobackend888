// services/buscarMemorias.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { prepareQueryEmbedding } from "./prepareQueryEmbedding";

export interface MemoriaSimilar {
  id: string;
  resumo_eco: string;
  tags: string[];
  emocao_principal?: string;
  intensidade?: number;
  created_at?: string;
  similarity?: number; // v2
  distancia?: number; // v2 (1 - similarity)
}

type Nullable<T> = T | null | undefined;

export interface DBRow {
  memoria_id?: Nullable<string>;
  id?: Nullable<string>;
  resumo_eco?: Nullable<string>;
  tags?: Nullable<unknown>;
  emocao_principal?: Nullable<string>;
  intensidade?: Nullable<number>;
  created_at?: Nullable<string>;
  similarity_score?: Nullable<number>;
  similarity?: Nullable<number>;
  effective_score?: Nullable<number>;
}

function toMemoriaSimilar(row: DBRow): MemoriaSimilar | null {
  const memoriaId =
    typeof row.memoria_id === "string" && row.memoria_id.trim().length > 0
      ? row.memoria_id
      : typeof row.id === "string" && row.id.trim().length > 0
      ? row.id
      : null;
  if (!memoriaId) return null;

  const resumoEco = typeof row.resumo_eco === "string" ? row.resumo_eco : "";
  const tags = Array.isArray(row.tags)
    ? (row.tags.filter((tag): tag is string => typeof tag === "string") ?? [])
    : [];
  const similarity =
    typeof row.similarity_score === "number"
      ? Number(row.similarity_score)
      : typeof row.similarity === "number"
      ? Number(row.similarity)
      : undefined;
  const intensidade =
    typeof row.intensidade === "number"
      ? Number(row.intensidade)
      : row.intensidade != null
      ? Number(row.intensidade)
      : undefined;
  const createdAt = typeof row.created_at === "string" ? row.created_at : undefined;
  const emocaoPrincipal =
    typeof row.emocao_principal === "string" && row.emocao_principal.trim().length > 0
      ? row.emocao_principal
      : undefined;

  return {
    id: memoriaId,
    resumo_eco: resumoEco,
    tags,
    emocao_principal: emocaoPrincipal,
    intensidade,
    created_at: createdAt,
    similarity,
    distancia: typeof similarity === "number" ? Math.max(0, 1 - similarity) : undefined,
  };
}

function isMemoriaSimilar(value: MemoriaSimilar | null): value is MemoriaSimilar {
  return value !== null;
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

    const rows: DBRow[] = Array.isArray(data) ? (data as DBRow[]) : [];

    return rows
      .filter((row) => {
        const score =
          typeof row?.effective_score === "number" ? Number(row.effective_score) : null;
        return score == null || score >= match_threshold;
      })
      .map(toMemoriaSimilar)
      .filter(isMemoriaSimilar)
      .slice(0, k);
  } catch (e) {
    console.error("❌ Erro interno ao buscar memórias:", (e as Error).message);
    return [];
  }
}

export const buscarMemoriasSemelhantesV2 = buscarMemoriasSemelhantes;

