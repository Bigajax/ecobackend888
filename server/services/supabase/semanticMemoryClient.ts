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
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ENV_PRIMARY_THRESHOLD = Number(
  process.env.SEMANTIC_MEMORY_PRIMARY_THRESHOLD ?? Number.NaN
);
const ENV_FALLBACK_THRESHOLD = Number(
  process.env.SEMANTIC_MEMORY_FALLBACK_THRESHOLD ?? Number.NaN
);
const ENV_DAYS_BACK_OVERRIDE = Number(
  process.env.SEMANTIC_MEMORY_DAYS_BACK_OVERRIDE ?? Number.NaN
);
const ENV_EMBEDDING_DIMENSION = Number(
  process.env.SEMANTIC_MEMORY_EMBEDDING_DIMENSION ?? Number.NaN
);

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

function canonicalGuestUserId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("guest_")) {
    const suffix = trimmed.slice(6);
    return UUID_V4_REGEX.test(suffix) ? `guest_${suffix}` : trimmed;
  }
  return UUID_V4_REGEX.test(trimmed) ? `guest_${trimmed}` : null;
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
      : Number.isFinite(ENV_PRIMARY_THRESHOLD)
      ? ENV_PRIMARY_THRESHOLD
      : DEFAULT_PRIMARY_THRESHOLD;
  const resolvedFallbackThreshold =
    typeof fallbackThreshold === "number" && Number.isFinite(fallbackThreshold)
      ? fallbackThreshold
      : Number.isFinite(ENV_FALLBACK_THRESHOLD)
      ? ENV_FALLBACK_THRESHOLD
      : DEFAULT_FALLBACK_THRESHOLD;
  const resolvedDaysBack =
    Number.isFinite(ENV_DAYS_BACK_OVERRIDE) && ENV_DAYS_BACK_OVERRIDE > 0
      ? Math.floor(ENV_DAYS_BACK_OVERRIDE)
      : DAYS_BACK;

  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return { rows: [], thresholdUsed: resolvedPrimaryThreshold };
  }

  let normalizedUserId = normalizeId(userId);
  let normalizedInsertId = normalizeId(userIdUsedForInsert ?? userId);
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

  const resolvedUserId = (() => {
    if (normalizedAuthUid) {
      return normalizedUserId || normalizedInsertId || normalizedAuthUid || null;
    }

    const candidateUser = normalizedUserId;
    const candidateInsert = normalizedInsertId;

    if (!candidateUser && !candidateInsert) {
      return null;
    }

    if (candidateUser && candidateInsert && candidateUser === candidateInsert) {
      return candidateUser;
    }

    const canonicalUser = canonicalGuestUserId(candidateUser);
    const canonicalInsert = canonicalGuestUserId(candidateInsert);

    if (canonicalUser && canonicalInsert && canonicalUser === canonicalInsert) {
      return canonicalUser;
    }

    if (!candidateInsert && canonicalUser) {
      return canonicalUser;
    }

    if (!candidateUser && canonicalInsert) {
      return canonicalInsert;
    }

    if (!candidateUser && candidateInsert) {
      return canonicalInsert ?? candidateInsert;
    }

    if (!candidateInsert && candidateUser) {
      return canonicalUser ?? candidateUser;
    }

    if (canonicalUser && candidateInsert && canonicalUser === candidateInsert) {
      return canonicalUser;
    }

    if (canonicalInsert && candidateUser && canonicalInsert === candidateUser) {
      return canonicalInsert;
    }

    return null;
  })();

  if (!resolvedUserId) {
    const mismatchPayload = {
      auth_uid: normalizedAuthUid || null,
      user_id_input: normalizedUserId || null,
      user_id_do_insert: normalizedInsertId || null,
    };
    console.warn("[semantic_memory] identity_mismatch", mismatchPayload);
    logSummary(0, { threshold: resolvedPrimaryThreshold, skipped: true, latency: 0 });
    return { rows: [], thresholdUsed: resolvedPrimaryThreshold };
  }

  normalizedUserId = resolvedUserId;
  normalizedInsertId = resolvedUserId;

  if (
    Number.isFinite(ENV_EMBEDDING_DIMENSION) &&
    ENV_EMBEDDING_DIMENSION > 0 &&
    queryEmbedding.length !== ENV_EMBEDDING_DIMENSION
  ) {
    if (isDebugEnabled()) {
      console.warn("[semantic_memory] embedding_dimension_mismatch", {
        expected: ENV_EMBEDDING_DIMENSION,
        received: queryEmbedding.length,
      });
    }
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
        days_back: resolvedDaysBack,
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

// New: Semantic memory retrieval with text query (RLS-aware)

export interface RetrievedMemory {
  id: string;
  texto: string;
  score: number;
  tags: string[];
  dominio_vida: string | null;
  created_at: string | null;
}

export interface BuscarMemoriasSemanticasParams {
  usuarioId: string;
  queryText: string;
  bearerToken?: string;
  topK?: number;
  minScore?: number;
  includeRefs?: boolean;
}

export interface BuscarMemoriasSemanticasResult {
  memories: RetrievedMemory[];
  fetchedCount: number;
  minScoreFinal: number;
  minMaxScore: { min: number; max: number } | null;
}

const DEBUG_SEMANTIC_RETRIEVAL = process.env.ECO_DEBUG === "1" || process.env.DEBUG_SEMANTICA === "true";

function debugLog(msg: string, payload: Record<string, unknown>): void {
  if (DEBUG_SEMANTIC_RETRIEVAL) {
    console.log(`[buscarMemoriasSemanticas] ${msg}`, payload);
  }
}

/**
 * Retrieve semantically similar memories using text query with RLS enforcement.
 * Uses bearer token for user isolation (RLS).
 */
export async function buscarMemoriasSemanticas({
  usuarioId,
  queryText,
  bearerToken,
  topK = 8,
  minScore = 0.30,
  includeRefs = false,
}: BuscarMemoriasSemanticasParams): Promise<BuscarMemoriasSemanticasResult> {
  const startMs = Date.now();

  if (!usuarioId || !queryText || !queryText.trim()) {
    debugLog("skipped_empty_input", { usuarioId, queryLen: queryText?.length ?? 0 });
    return {
      memories: [],
      fetchedCount: 0,
      minScoreFinal: minScore,
      minMaxScore: null,
    };
  }

  try {
    // Dynamic imports to avoid circular dependencies
    const { getEmbeddingCached } = await import("../../adapters/EmbeddingAdapter");
    const { supabaseWithBearer } = await import("../../adapters/SupabaseAdapter");

    // Generate embedding from query text
    debugLog("generating_embedding", { textLen: queryText.length });
    const queryEmbedding = await getEmbeddingCached(queryText, "semantic_memory_query");

    if (!queryEmbedding || queryEmbedding.length === 0) {
      debugLog("embedding_failed", { queryTextLen: queryText.length });
      return {
        memories: [],
        fetchedCount: 0,
        minScoreFinal: minScore,
        minMaxScore: null,
      };
    }

    // Create RLS-aware client (bearer token enforces user isolation)
    let supabaseClient: SupabaseClient;
    if (bearerToken) {
      supabaseClient = supabaseWithBearer(bearerToken);
    } else {
      // Fallback to admin client (RLS still enforced via user ID)
      const admin = getSupabaseAdmin();
      if (!admin) {
        debugLog("no_supabase_client", { usuarioId });
        return {
          memories: [],
          fetchedCount: 0,
          minScoreFinal: minScore,
          minMaxScore: null,
        };
      }
      supabaseClient = admin;
    }

    // Call RPC with embedding
    debugLog("calling_rpc", {
      usuarioId,
      embeddingDim: queryEmbedding.length,
      topK,
      minScore,
      includeRefs,
    });

    const { data, error } = await supabaseClient.rpc(
      "buscar_memorias_semanticas_v2",
      {
        p_usuario_id: usuarioId,
        p_query_embedding: queryEmbedding,
        p_top_k: topK,
        p_min_score: minScore,
        p_incluir_referencias: includeRefs,
      } as Record<string, unknown>
    );

    if (error) {
      debugLog("rpc_error", {
        message: (error as any)?.message,
        usuarioId,
      });
      return {
        memories: [],
        fetchedCount: 0,
        minScoreFinal: minScore,
        minMaxScore: null,
      };
    }

    // Map RPC result to RetrievedMemory format
    if (!Array.isArray(data)) {
      debugLog("invalid_rpc_response", { dataType: typeof data });
      return {
        memories: [],
        fetchedCount: 0,
        minScoreFinal: minScore,
        minMaxScore: null,
      };
    }

    const memories: RetrievedMemory[] = data
      .map((row: any) => {
        const score = typeof row.similarity === "number" ? row.similarity : 0;
        return {
          id: row.id ?? "",
          texto: row.resumo_eco ?? row.contexto ?? "",
          score,
          tags: Array.isArray(row.tags) ? row.tags : [],
          dominio_vida: row.dominio_vida ?? null,
          created_at: row.created_at ?? null,
        };
      })
      .filter((m) => m.texto && m.score >= (minScore ?? 0));

    const minMaxScores = memories.length > 0
      ? {
          min: Math.min(...memories.map((m) => m.score)),
          max: Math.max(...memories.map((m) => m.score)),
        }
      : null;

    const latencyMs = Date.now() - startMs;
    debugLog("success", {
      count: memories.length,
      minScore: minMaxScores?.min ?? null,
      maxScore: minMaxScores?.max ?? null,
      latencyMs,
    });

    return {
      memories,
      fetchedCount: memories.length,
      minScoreFinal: minScore,
      minMaxScore: minMaxScores,
    };
  } catch (error) {
    debugLog("exception", {
      message: error instanceof Error ? error.message : String(error),
      usuarioId,
    });
    return {
      memories: [],
      fetchedCount: 0,
      minScoreFinal: minScore,
      minMaxScore: null,
    };
  }
}
