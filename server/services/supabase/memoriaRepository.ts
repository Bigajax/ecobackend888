import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareQueryEmbedding } from "../prepareQueryEmbedding";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export type RetrieveMode = "FAST" | "DEEP";

type RetrieveConfig = {
  k: number;
  limiar: number;
  mmr_lambda: number;
  half_life: number;
};

const FAST: RetrieveConfig = { k: 24, limiar: 0.6, mmr_lambda: 0.3, half_life: 30 };
const DEEP: RetrieveConfig = { k: 60, limiar: 0.55, mmr_lambda: 0.5, half_life: 45 };

export interface BuscarMemoriasComModoArgs {
  userId: string;
  embedding: number[];
  mode: RetrieveMode;
  filtros?: {
    tags?: string[];
    emocao?: string | null;
    includeReferencias?: boolean;
    tokenBudget?: number;
    queryEmocional?: number[] | null;
  };
  supabaseClient?: SupabaseClient;
}

export interface MemoriaSemantica {
  origem: string;
  memoria_id: string;
  mensagem_id: string | null;
  texto: string | null;
  resumo_eco: string | null;
  tags: string[] | null;
  dominio_vida: string | null;
  emocao_principal: string | null;
  intensidade: number | null;
  pin: boolean | null;
  salvar_memoria: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  composite_score: number | null;
  similarity_score: number | null;
  emotional_similarity: number | null;
  recency_score: number | null;
  tag_overlap_score: number | null;
  emotion_match_score: number | null;
  effective_score: number | null;
}

const DEFAULT_TOKEN_BUDGET = 1800;

function resolveConfig(mode: RetrieveMode): RetrieveConfig {
  return mode === "DEEP" ? DEEP : FAST;
}

export async function buscarMemoriasComModo({
  userId,
  embedding,
  mode,
  filtros,
  supabaseClient,
}: BuscarMemoriasComModoArgs): Promise<MemoriaSemantica[]> {
  if (!Array.isArray(embedding) || embedding.length === 0) return [];
  const queryEmbedding = await prepareQueryEmbedding({ userEmbedding: embedding });
  if (!queryEmbedding) return [];

  const config = resolveConfig(mode);
  const client = supabaseClient ?? getSupabaseAdmin();
  if (!client) {
    throw new Error("Supabase client indisponível");
  }

  try {
    const { data, error } = await client.rpc("buscar_memorias_semanticas", {
      p_usuario_id: userId,
      p_query: queryEmbedding,
      p_limit: config.k,
      p_lambda_mmr: config.mmr_lambda,
      p_recency_halflife_hours: config.half_life,
      p_token_budget: filtros?.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
      p_tags: filtros?.tags ?? [],
      p_emocao: filtros?.emocao ?? null,
      p_include_referencias: filtros?.includeReferencias ?? true,
      p_query_emocional: filtros?.queryEmocional ?? null,
    } as Record<string, unknown>);

    const isMissingFn =
      error &&
      typeof (error as any)?.message === "string" &&
      /(function|procedure)\s+buscar_memorias_semanticas/i.test((error as any).message);

    const fallbackRows = async () => {
      console.info("[memoriaRepository] rpc_fallback", { target: "semelhantes_v2" });
      const args = {
        p_usuario_id: userId,
        p_query: queryEmbedding,
        p_limit: config.k,
        p_lambda_mmr: config.mmr_lambda,
        p_recency_halflife_hours: config.half_life,
        p_tags: filtros?.tags ?? [],
        p_emocao: filtros?.emocao ?? null,
        p_include_referencias: filtros?.includeReferencias ?? true,
        p_token_budget: filtros?.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
        p_query_emocional: filtros?.queryEmocional ?? null,
      } as Record<string, unknown>;

      const { data: fallbackData, error: fallbackError } = await client.rpc(
        "buscar_memorias_semelhantes_v2",
        args
      );

      if (fallbackError) {
        console.warn("⚠️ RPC buscar_memorias_semelhantes_v2 falhou", {
          message: (fallbackError as any)?.message,
          details: (fallbackError as any)?.details,
          hint: (fallbackError as any)?.hint,
        });
        return [] as MemoriaSemantica[];
      }

      return Array.isArray(fallbackData) ? (fallbackData as MemoriaSemantica[]) : [];
    };

    const rowsSource = error
      ? isMissingFn
        ? await fallbackRows()
        : (() => {
            console.warn("⚠️ RPC buscar_memorias_semanticas falhou", {
              message: (error as any)?.message,
              details: (error as any)?.details,
              hint: (error as any)?.hint,
            });
            return [] as MemoriaSemantica[];
          })()
      : Array.isArray(data)
      ? (data as MemoriaSemantica[])
      : [];

    return rowsSource.filter((row) => {
      const score = typeof row?.effective_score === "number" ? row.effective_score : null;
      return score == null || score >= config.limiar;
    });
  } catch (error) {
    console.error("❌ Erro buscarMemoriasComModo", { message: (error as Error)?.message });
    return [];
  }
}

export const retrieveConfigs = { FAST, DEEP };
