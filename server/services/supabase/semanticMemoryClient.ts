import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export interface SemanticMemoryRow {
  id: string;
  resumo_eco: string | null;
  tags: string[] | null;
  emocao_principal: string | null;
  intensidade: number | null;
  created_at: string | null;
  similarity: number | null;
  distancia: number | null;
}

export interface BuscarMemoriasSemelhantesParams {
  userId: string;
  queryEmbedding: number[];
  currentMemoryId?: string | null;
  supabaseClient?: SupabaseClient;
  userIdUsedForInsert?: string | null;
}

export interface BuscarMemoriasSemelhantesResult {
  rows: SemanticMemoryRow[];
  thresholdUsed: number;
}

const MATCH_COUNT = 5;
const PRIMARY_THRESHOLD = 0.72;
const FALLBACK_THRESHOLD = 0.65;
const DAYS_BACK = 365;

function isDebugEnabled(): boolean {
  return process.env.DEBUG_SEMANTICA === "true";
}

function safeSliceIds(rows: SemanticMemoryRow[]): string[] {
  return rows
    .slice(0, 3)
    .map((row) => (typeof row?.id === "string" ? row.id : ""))
    .filter((id) => id.length > 0);
}

export async function buscarMemoriasSemelhantesV2({
  userId,
  queryEmbedding,
  currentMemoryId,
  supabaseClient,
  userIdUsedForInsert,
}: BuscarMemoriasSemelhantesParams): Promise<BuscarMemoriasSemelhantesResult> {
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return { rows: [], thresholdUsed: PRIMARY_THRESHOLD };
  }

  const client = supabaseClient ?? getSupabaseAdmin();
  if (!client) {
    if (isDebugEnabled()) {
      console.warn("[semantic_memory] supabase_client_unavailable", { userId });
    }
    return { rows: [], thresholdUsed: PRIMARY_THRESHOLD };
  }

  const userInsert = userIdUsedForInsert ?? userId;
  if (isDebugEnabled()) {
    console.log("[semantic_memory] user_id_check", {
      userIdUsadoNoInsert: userInsert ?? null,
      userIdDaBusca: userId,
      same: userInsert === userId,
    });
  }

  const callRpc = async (threshold: number) => {
    const start = Date.now();
    try {
      const { data, error } = await client.rpc(
        "buscar_memorias_semelhantes_v2",
        {
          query_embedding: queryEmbedding,
          user_id_input: userId,
          match_count: MATCH_COUNT,
          match_threshold: threshold,
          days_back: DAYS_BACK,
        } as unknown as Record<string, unknown>
      );
      const latency = Date.now() - start;
      if (error) {
        if (isDebugEnabled()) {
          console.warn("[semantic_memory] rpc_error", {
            userId,
            threshold,
            message: (error as any)?.message,
            details: (error as any)?.details,
            latency_ms: latency,
          });
        }
        return { rows: [] as SemanticMemoryRow[], latency, error };
      }
      const rows = Array.isArray(data) ? (data as SemanticMemoryRow[]) : [];
      return { rows, latency, error: null };
    } catch (error) {
      const latency = Date.now() - start;
      if (isDebugEnabled()) {
        console.error("[semantic_memory] rpc_exception", {
          userId,
          threshold,
          message: error instanceof Error ? error.message : String(error),
          latency_ms: latency,
        });
      }
      return { rows: [] as SemanticMemoryRow[], latency, error };
    }
  };

  let thresholdUsed = PRIMARY_THRESHOLD;
  let rpcResult = await callRpc(PRIMARY_THRESHOLD);
  let latencyUsed = rpcResult.latency;

  if (!rpcResult.error && rpcResult.rows.length === 0) {
    thresholdUsed = FALLBACK_THRESHOLD;
    rpcResult = await callRpc(FALLBACK_THRESHOLD);
    latencyUsed = rpcResult.latency;
  }

  if (rpcResult.error) {
    return { rows: [], thresholdUsed };
  }

  const filtered = rpcResult.rows.filter((row) => {
    if (!currentMemoryId) return true;
    const rowId = typeof row?.id === "string" ? row.id : null;
    return !rowId || rowId !== currentMemoryId;
  });

  const limited = filtered.slice(0, MATCH_COUNT);

  if (isDebugEnabled()) {
    console.log("[semantic_memory] recall_result", {
      userId,
      mem_count: limited.length,
      threshold_usado: thresholdUsed,
      top_ids: safeSliceIds(limited),
      latency_rpc_ms: latencyUsed,
    });
  }

  return { rows: limited, thresholdUsed };
}
