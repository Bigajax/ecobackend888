import mixpanel from "../../server/lib/mixpanel";
import { getSupabaseAdmin } from "../../server/lib/supabaseAdmin";
import type { RetrieveMode } from "../promptPlan/montarContextoEco";
import {
  buscarMemoriasSemelhantesV2 as callSemanticMemories,
  type BuscarMemoriasSemelhantesParams,
} from "../../server/services/supabase/semanticMemoryClient";

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
    currentMemoryId?: string | null;
    userIdUsedForInsert?: string | null;
  };
}

export interface MemoriaSemantica {
  id: string;
  resumo_eco?: string | null;
  tags?: string[] | null;
  emocao_principal?: string | null;
  intensidade?: number | null;
  created_at?: string | null;
  similarity?: number | null;
  distancia?: number | null;
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
  resolveRetrieveConfig(params.mode);
  const client = getSupabaseAdmin();

  if (!client) {
    console.error("[ecoCortex] supabase_client_unavailable");
    return [];
  }

  try {
    const paramsRpc: BuscarMemoriasSemelhantesParams = {
      userId: params.userId,
      queryEmbedding: params.queryEmbedding,
      supabaseClient: client,
      currentMemoryId: params.filtros?.currentMemoryId ?? null,
      userIdUsedForInsert: params.filtros?.userIdUsedForInsert ?? params.userId,
    };

    const { rows } = await callSemanticMemories(paramsRpc);
    return rows as MemoriaSemantica[];
  } catch (error) {
    console.error("[ecoCortex] buscar_memorias_failed", error);
    return [];
  }
}
