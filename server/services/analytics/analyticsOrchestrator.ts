import { randomUUID } from "node:crypto";

import { ensureSupabaseConfigured } from "../../lib/supabaseAdmin";
import supabaseAdmin from "../../lib/supabaseAdmin";
import type { ActivationTracer } from "../../core/activationTracer";
import type { RuntimeMetrics } from "../../types/telemetry";
import type { GetEcoResult } from "../../utils";
import { log } from "../promptContext/logger";
import { isValidUuid } from "../utils/validators";
import {
  buildBanditRows,
  buildHeuristicRows,
  buildKnapsackRows,
  buildLatencyRow,
  buildModuleRows,
  buildResponseRow,
  createInsertRows,
} from "./insertHelpers";
import type { PersistAnalyticsOptions, ResponseAnalyticsMeta } from "./types";

function snapshotLatency(activationTracer?: ActivationTracer | null): RuntimeMetrics["latency"] {
  const runtime: RuntimeMetrics["latency"] = { ttfb_ms: null, ttlc_ms: null };
  const tracerSnapshot = activationTracer?.snapshot?.();
  const tracerLatency = tracerSnapshot?.latency;

  if (typeof tracerLatency?.firstTokenMs === "number" && Number.isFinite(tracerLatency.firstTokenMs)) {
    runtime.ttfb_ms = Math.max(0, Math.round(tracerLatency.firstTokenMs));
  }

  if (typeof tracerLatency?.totalMs === "number" && Number.isFinite(tracerLatency.totalMs)) {
    runtime.ttlc_ms = Math.max(0, Math.round(tracerLatency.totalMs));
  }

  return runtime;
}

function applyLatencyFallbacks({
  meta,
  runtime,
}: {
  meta: GetEcoResult["meta"];
  runtime: RuntimeMetrics["latency"];
}) {
  const analyticsLatency = (meta.analytics as ResponseAnalyticsMeta | null)?.latency ?? null;
  if (
    runtime.ttfb_ms == null &&
    typeof analyticsLatency?.ttfb_ms === "number" &&
    Number.isFinite(analyticsLatency.ttfb_ms)
  ) {
    runtime.ttfb_ms = Math.max(0, Math.round(analyticsLatency.ttfb_ms));
  }

  if (
    runtime.ttlc_ms == null &&
    typeof analyticsLatency?.ttlc_ms === "number" &&
    Number.isFinite(analyticsLatency.ttlc_ms)
  ) {
    runtime.ttlc_ms = Math.max(0, Math.round(analyticsLatency.ttlc_ms));
  }

  if (runtime.ttlc_ms == null) {
    const timings = (meta.debug_trace as { timings?: any; latencyMs?: number } | undefined)?.timings;
    if (timings?.llmStart != null && timings?.llmEnd != null) {
      const diff = Math.round(timings.llmEnd - timings.llmStart);
      if (Number.isFinite(diff)) {
        runtime.ttlc_ms = Math.max(0, diff);
      }
    }
  }

  if (runtime.ttlc_ms == null) {
    const latencyMs = (meta.debug_trace as { latencyMs?: number } | undefined)?.latencyMs;
    if (typeof latencyMs === "number" && Number.isFinite(latencyMs)) {
      runtime.ttlc_ms = Math.max(0, Math.round(latencyMs));
    }
  }
}

export async function persistAnalyticsRecords({
  result,
  retrieveMode,
  activationTracer,
  userId,
}: PersistAnalyticsOptions): Promise<void> {
  if (!result) return;

  const meta = (result.meta ??= {});
  const analyticsMeta = (meta.analytics ?? null) as ResponseAnalyticsMeta | null;
  if (!analyticsMeta) return;

  const existingResponseId = analyticsMeta.response_id;
  const responseId = isValidUuid(existingResponseId) ? existingResponseId : randomUUID();
  meta.analytics = { ...analyticsMeta, response_id: responseId };

  try {
    ensureSupabaseConfigured();
  } catch (error) {
    if (process.env.ECO_DEBUG === "1") {
      const message = error instanceof Error ? error.message : String(error);
      log.debug("[analytics]", { tabela: "skipped", response_id: responseId, motivo: message });
    }
    return;
  }

  const analyticsClient = supabaseAdmin.schema("analytics");
  const normalizedUserId = isValidUuid(userId) ? userId : null;

  const runtime: RuntimeMetrics["latency"] = snapshotLatency(activationTracer);
  applyLatencyFallbacks({ meta, runtime });

  const insertRows = createInsertRows(analyticsClient, responseId);
  const responseRow = buildResponseRow({
    analyticsMeta,
    responseId,
    retrieveMode,
    userId: normalizedUserId,
    runtime,
  });

  const tasks: Array<Promise<void>> = [];
  tasks.push(insertRows("resposta_q", [responseRow]));

  const banditRows = buildBanditRows(analyticsMeta, responseId);
  if (banditRows.length) {
    tasks.push(insertRows("bandit_rewards", banditRows));
  }

  const moduleRows = buildModuleRows(analyticsMeta, responseId);
  if (moduleRows.length) {
    tasks.push(insertRows("module_outcomes", moduleRows));
  }

  const heuristicRows = buildHeuristicRows(analyticsMeta, responseId);
  if (heuristicRows.length) {
    tasks.push(insertRows("heuristics_events", heuristicRows));
  }

  const knapsackRows = buildKnapsackRows(analyticsMeta, responseId);
  if (knapsackRows.length) {
    tasks.push(insertRows("knapsack_decision", knapsackRows));
  }

  const latencyRow = buildLatencyRow({ responseId, analyticsMeta, runtime });
  if (latencyRow) {
    tasks.push(insertRows("latency_samples", [latencyRow]));
  }

  await Promise.all(tasks);
}

export async function persistAnalyticsSafe(options: PersistAnalyticsOptions): Promise<void> {
  try {
    await persistAnalyticsRecords(options);
  } catch (error) {
    if (process.env.ECO_DEBUG === "1") {
      const responseId =
        ((options.result?.meta as { analytics?: { response_id?: string | null } } | null)?.analytics?.response_id ??
          null);
      const message = error instanceof Error ? error.message : String(error);
      log.debug("[analytics]", { tabela: "persist_failed", response_id: responseId, motivo: message });
    }
  }
}

export function withAnalyticsFinalize(
  finalize: () => Promise<GetEcoResult>,
  analyticsOptions: Omit<PersistAnalyticsOptions, "result">
) {
  let finalizePromise: Promise<GetEcoResult> | null = null;
  return async () => {
    if (!finalizePromise) {
      finalizePromise = (async () => {
        const result = await finalize();
        await persistAnalyticsSafe({ ...analyticsOptions, result });
        return result;
      })();
    }
    return finalizePromise;
  };
}
