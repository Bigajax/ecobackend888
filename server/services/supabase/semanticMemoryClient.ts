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
  authUid?: string | null;
  primaryThreshold?: number;
  fallbackThreshold?: number;
}

export interface BuscarMemoriasSemelhantesResult {
  rows: SemanticMemoryRow[];
  thresholdUsed: number;
}

const MATCH_COUNT = 5;
const DEFAULT_PRIMARY_THRESHOLD = 0.72;
const DEFAULT_FALLBACK_THRESHOLD = 0.65;
const DAYS_BACK = 365;
const SELF_MIN_AGE_MS = 2 * 60 * 1000;

function isDebugEnabled(): boolean {
  return process.env.DEBUG_SEMANTICA === "true";
}

function safeSliceIds(rows: SemanticMemoryRow[]): string[] {
  return rows
    .slice(0, 3)
    .map((row) => (typeof row?.id === "string" ? row.id : ""))
    .filter((id) => id.length > 0);
}

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseCreatedAt(row: SemanticMemoryRow): number | null {
  const raw = typeof row?.created_at === "string" ? row.created_at.trim() : "";
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function filterSelfRows(
  rows: SemanticMemoryRow[],
  currentMemoryId: string | null | undefined
): SemanticMemoryRow[] {
  const targetId = normalizeId(currentMemoryId);
  if (!targetId) return rows;

  const others: SemanticMemoryRow[] = [];
  const selfCandidates: SemanticMemoryRow[] = [];

  for (const row of rows) {
    const rowId = normalizeId(row?.id);
    if (rowId && rowId === targetId) {
      selfCandidates.push(row);
      continue;
    }
    others.push(row);
  }

  if (others.length > 0) {
    return others;
  }

  if (!selfCandidates.length) {
    return rows;
  }

  const now = Date.now();
  const aged = selfCandidates.find((row) => {
    const createdAt = parseCreatedAt(row);
    if (createdAt == null) return false;
    return now - createdAt >= SELF_MIN_AGE_MS;
  });

  return aged ? [aged] : [];
}

export async function buscarMemoriasSemelhantesV2({
  userId,
  queryEmbedding,
  currentMemoryId,
  supabaseClient,
  userIdUsedForInsert,
  authUid,
  primaryThreshold,
  fallbackThreshold,
}: BuscarMemoriasSemelhantesParams): Promise<BuscarMemoriasSemelhantesResult> {
  const resolvedPrimaryThreshold =
    typeof primaryThreshold === "number" && Number.isFinite(primaryThreshold)
      ? primaryThreshold
      : DEFAULT_PRIMARY_THRESHOLD;
  const resolvedFallbackThreshold =
    typeof fallbackThreshold === "number" && Number.isFinite(fallbackThreshold)
      ? fallbackThreshold
      : DEFAULT_FALLBACK_THRESHOLD;

  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return { rows: [], thresholdUsed: resolvedPrimaryThreshold };
  }

  const normalizedUserId = normalizeId(userId);
  const normalizedInsertId = normalizeId(userIdUsedForInsert ?? userId);
  const normalizedAuthUid = normalizeId(authUid);

  const logSummary = (
    memCount: number,
    options: { threshold: number; topIds?: string[]; latency?: number; skipped?: boolean }
  ) => {
    if (!isDebugEnabled()) return;
    const payload: Record<string, unknown> = {
      auth_uid: normalizedAuthUid || null,
      user_id_input: normalizedUserId || null,
      user_id_do_insert: normalizedInsertId || null,
      threshold_usado: options.threshold,
      mem_count: memCount,
      top_ids: options.topIds ?? [],
      latency_ms: options.latency ?? 0,
    };
    if (options.skipped) {
      payload.skipped = true;
    }
    console.log("[semantic_memory] recall_result", payload);
  };

  if (!normalizedUserId) {
    logSummary(0, { threshold: resolvedPrimaryThreshold, skipped: true, latency: 0 });
    return { rows: [], thresholdUsed: resolvedPrimaryThreshold };
  }

  if (normalizedInsertId && normalizedInsertId !== normalizedUserId) {
    const mismatchPayload = {
      auth_uid: normalizedAuthUid || null,
      user_id_input: normalizedUserId,
      user_id_do_insert: normalizedInsertId,
    };
    console.warn("[semantic_memory] identity_mismatch", mismatchPayload);
    logSummary(0, { threshold: resolvedPrimaryThreshold, skipped: true, latency: 0 });
    return { rows: [], thresholdUsed: resolvedPrimaryThreshold };
  }

  const client = supabaseClient ?? getSupabaseAdmin();
  if (!client) {
    if (isDebugEnabled()) {
      console.warn("[semantic_memory] supabase_client_unavailable", { userId });
    }
    logSummary(0, { threshold: resolvedPrimaryThreshold, skipped: true, latency: 0 });
    return { rows: [], thresholdUsed: resolvedPrimaryThreshold };
  }

  const functionName = "buscar_memorias_semelhantes_v2";
  const callRpc = async (threshold: number) => {
    const start = Date.now();
    try {
      const payload = {
        query_embedding: queryEmbedding,
        user_id_input: normalizedUserId,
        match_count: MATCH_COUNT,
        match_threshold: threshold,
        days_back: DAYS_BACK,
      } as const;
      if (isDebugEnabled()) {
        console.debug("[semantic_memory] rpc_call", { functionName, payload });
      }
      const { data, error } = await client.rpc(functionName, payload as Record<string, unknown>);
      const latency = Date.now() - start;
      if (error) {
        if (isDebugEnabled()) {
          console.warn("[semantic_memory] rpc_error", {
            userId: normalizedUserId,
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
          userId: normalizedUserId,
          threshold,
          message: error instanceof Error ? error.message : String(error),
          latency_ms: latency,
        });
      }
      return { rows: [] as SemanticMemoryRow[], latency, error };
    }
  };

  let thresholdUsed = resolvedPrimaryThreshold;
  const primaryResult = await callRpc(resolvedPrimaryThreshold);
  let rpcResult = primaryResult;
  let fallbackResult: typeof primaryResult | null = null;

  if (!primaryResult.error && primaryResult.rows.length === 0) {
    thresholdUsed = resolvedFallbackThreshold;
    fallbackResult = await callRpc(resolvedFallbackThreshold);
    rpcResult = fallbackResult;
  }

  const totalLatency =
    (primaryResult.latency ?? 0) +
    (thresholdUsed === resolvedFallbackThreshold ? fallbackResult?.latency ?? 0 : 0);

  if (rpcResult.error) {
    logSummary(0, { threshold: thresholdUsed, latency: totalLatency });
    return { rows: [], thresholdUsed };
  }

  const filtered = filterSelfRows(rpcResult.rows, currentMemoryId);
  const limited = filtered.slice(0, MATCH_COUNT);

  logSummary(limited.length, {
    threshold: thresholdUsed,
    topIds: safeSliceIds(limited),
    latency: totalLatency,
  });

  return { rows: limited, thresholdUsed };
}
