import mixpanel from "../../server/lib/mixpanel";
import { getSupabaseAdmin } from "../../server/lib/supabaseAdmin";
import type { RetrieveMode } from "../promptPlan/montarContextoEco";

export interface RetrieveConfig {
  k: number;
  limiar: number;
  mmr: number;
}

export interface BuscarMemoriasParams {
  userId: string;
  queryEmbedding: number[];
  mode: RetrieveMode;
  filtros?: {
    tokenBudget?: number;
    tags?: string[];
    emocao?: string | null;
    includeReferencias?: boolean;
    queryEmocional?: number[] | null;
  };
}

export interface MemoriaSemantica {
  id: string;
  conteudo: string;
  tokens?: number;
  effective_score?: number;
  [key: string]: unknown;
}

const RETRIEVE_CONFIGS: Record<RetrieveMode, RetrieveConfig> = {
  FAST: { k: 24, limiar: 0.6, mmr: 0.3 },
  DEEP: { k: 60, limiar: 0.55, mmr: 0.5 },
};

function emitRetrieveTelemetry(mode: RetrieveMode, config: RetrieveConfig) {
  try {
    mixpanel.track("Retrieve_Mode", {
      retrieve_mode: mode,
      k: config.k,
      limiar: config.limiar,
      mmr: config.mmr,
      ts: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ecoCortex] mixpanel_retrieve_mode_error", error);
  }
}

export function resolveRetrieveConfig(mode: RetrieveMode): RetrieveConfig {
  const config = RETRIEVE_CONFIGS[mode] ?? RETRIEVE_CONFIGS.FAST;
  emitRetrieveTelemetry(mode, config);
  return config;
}

export async function buscarMemoriasSemanticas(
  params: BuscarMemoriasParams
): Promise<MemoriaSemantica[]> {
  const config = resolveRetrieveConfig(params.mode);
  const client = getSupabaseAdmin();

  if (!client) {
    console.error("[ecoCortex] supabase_client_unavailable");
    return [];
  }

  try {
    const { data, error } = await client.rpc("buscar_memorias_semanticas", {
      p_usuario_id: params.userId,
      p_query: params.queryEmbedding,
      p_limit: config.k,
      p_lambda_mmr: config.mmr,
      p_recency_halflife_hours: 72,
      p_token_budget: params.filtros?.tokenBudget ?? 1200,
      p_tags: params.filtros?.tags ?? [],
      p_emocao: params.filtros?.emocao ?? null,
      p_include_referencias: params.filtros?.includeReferencias ?? true,
      p_query_emocional: params.filtros?.queryEmocional ?? null,
    } as Record<string, unknown>);

    if (error) {
      console.warn("[ecoCortex] rpc_error", {
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      return [];
    }

    const rows = Array.isArray(data) ? (data as MemoriaSemantica[]) : [];
    return rows.filter((row) => {
      const score = typeof row?.effective_score === "number" ? row.effective_score : null;
      return score == null || score >= config.limiar;
    });
  } catch (error) {
    console.error("[ecoCortex] buscar_memorias_failed", error);
    return [];
  }
}
