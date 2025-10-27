import { log } from "../promptContext/logger";
import { asInteger, asNumber } from "../utils/validators";
import type { ResponseAnalyticsMeta } from "./types";

type AnalyticsClient = {
  from(table: string): any;
};

export type InsertRows = (table: string, rows: Array<Record<string, unknown>>) => Promise<void>;

export function createInsertRows(analyticsClient: AnalyticsClient, responseId: string): InsertRows {
  return async (table, rows) => {
    if (!rows.length) return;
    const payload = rows.map((row) => {
      const normalized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key] = value ?? null;
      }
      return normalized;
    });

    try {
      const result = await analyticsClient.from(table).insert(payload);
      const { error } = (result ?? {}) as { error?: { code?: string; message: string } | null };
      if (error) {
        log.error("[analytics] insert_failed", {
          tabela: table,
          response_id: responseId,
          payload,
          code: error.code ?? null,
          message: error.message,
        });
        return;
      }
      log.info("[analytics] insert_success", { tabela: table, response_id: responseId });
    } catch (error) {
      log.error("[analytics] insert_failed", {
        tabela: table,
        response_id: responseId,
        payload,
        code: error instanceof Error && (error as any).code ? (error as any).code : null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function buildResponseRow({
  analyticsMeta,
  responseId,
  retrieveMode,
  userId,
  runtime,
}: {
  analyticsMeta: ResponseAnalyticsMeta;
  responseId: string;
  retrieveMode: string;
  userId: string | null;
  runtime: { ttfb_ms?: number | null; ttlc_ms?: number | null };
}) {
  return {
    response_id: responseId,
    user_id: userId,
    retrieve_mode: retrieveMode,
    q: typeof analyticsMeta.q === "number" ? analyticsMeta.q : null,
    estruturado_ok:
      typeof analyticsMeta.estruturado_ok === "boolean" ? analyticsMeta.estruturado_ok : null,
    memoria_ok: typeof analyticsMeta.memoria_ok === "boolean" ? analyticsMeta.memoria_ok : null,
    bloco_ok: typeof analyticsMeta.bloco_ok === "boolean" ? analyticsMeta.bloco_ok : null,
    tokens_total: asInteger(analyticsMeta.tokens_total),
    tokens_aditivos: asInteger(analyticsMeta.tokens_aditivos),
    ttfb_ms: runtime.ttfb_ms ?? null,
    ttlc_ms: runtime.ttlc_ms ?? null,
  };
}

export function buildBanditRows(
  analyticsMeta: ResponseAnalyticsMeta,
  responseId: string
): Array<Record<string, unknown>> {
  if (!Array.isArray(analyticsMeta.bandit_rewards) || analyticsMeta.bandit_rewards.length === 0) {
    return [];
  }

  return analyticsMeta.bandit_rewards
    .filter((reward): reward is NonNullable<typeof reward> & { family: string; arm_id: string; chosen_by: string } => {
      if (!reward) return false;
      const familyValid = typeof reward.family === "string" && reward.family.length > 0;
      const armValid = typeof reward.arm_id === "string" && reward.arm_id.length > 0;
      const chooserValid =
        reward.chosen_by === "ts" || reward.chosen_by === "baseline" || reward.chosen_by === "shadow";
      return familyValid && armValid && chooserValid;
    })
    .map((reward) => ({
      interaction_id: reward.interaction_id ?? responseId ?? null,
      response_id: responseId,
      pilar: reward.family,
      family: reward.family,
      arm: reward.arm_id,
      arm_id: reward.arm_id,
      recompensa:
        typeof reward.reward === "number" && Number.isFinite(reward.reward) ? reward.reward : null,
      reward: typeof reward.reward === "number" && Number.isFinite(reward.reward) ? reward.reward : null,
      reward_reason: reward.reward_reason ?? null,
      chosen_by: reward.chosen_by,
      reward_key: reward.reward_key,
      tokens: reward.tokens,
      tokens_cap:
        typeof reward.tokens_cap === "number" && Number.isFinite(reward.tokens_cap)
          ? reward.tokens_cap
          : null,
      tokens_planned: reward.tokens_planned,
      ttfb_ms: reward.ttfb_ms,
      ttlc_ms: reward.ttlc_ms,
      like: reward.like,
      like_source: reward.like_source,
      dislike_reason: reward.dislike_reason,
      emotional_intensity: reward.emotional_intensity,
      memory_saved: reward.memory_saved,
      reply_within_10m: reward.reply_within_10m,
      user_id: reward.user_id,
      guest_id: reward.guest_id,
      meta: reward.meta ?? null,
    }));
}

export function buildModuleRows(
  analyticsMeta: ResponseAnalyticsMeta,
  responseId: string
): Array<Record<string, unknown>> {
  if (!Array.isArray(analyticsMeta.module_outcomes) || analyticsMeta.module_outcomes.length === 0) {
    return [];
  }

  return analyticsMeta.module_outcomes
    .filter(
      (entry): entry is { module_id: string; tokens: number; q: number; vpt: number | null } =>
        Boolean(
          entry &&
            typeof entry.module_id === "string" &&
            entry.module_id &&
            typeof entry.tokens === "number" &&
            Number.isFinite(entry.tokens) &&
            entry.tokens > 0 &&
            typeof entry.q === "number" &&
            Number.isFinite(entry.q)
        )
    )
    .map((entry) => ({
      response_id: responseId,
      module_id: entry.module_id,
      tokens: Math.max(0, Math.round(entry.tokens)),
      q: entry.q,
      vpt:
        typeof entry.vpt === "number" && Number.isFinite(entry.vpt)
          ? entry.vpt
          : entry.tokens > 0
          ? entry.q / entry.tokens
          : null,
    }));
}

export function buildHeuristicRows(
  analyticsMeta: ResponseAnalyticsMeta,
  responseId: string
): Array<Record<string, unknown>> {
  if (!Array.isArray(analyticsMeta.heuristics_events) || analyticsMeta.heuristics_events.length === 0) {
    return [];
  }

  return analyticsMeta.heuristics_events
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => ({
      interaction_id: entry.interaction_id ?? responseId ?? null,
      response_id: responseId,
      active_biases: Array.isArray(entry.active_biases) ? entry.active_biases : [],
      decayed_active_biases: Array.isArray(entry.decayed_active_biases) ? entry.decayed_active_biases : [],
      meta: entry.meta ?? null,
    }));
}

export function buildKnapsackRows(
  analyticsMeta: ResponseAnalyticsMeta,
  responseId: string
): Array<Record<string, unknown>> {
  if (!analyticsMeta.knapsack) return [];
  const knapsack = analyticsMeta.knapsack;
  const budget = asInteger(knapsack.budget);
  const ganhoEstimado = asNumber(knapsack.ganho_estimado);
  const tokensKnapsack = asInteger(knapsack.tokens_aditivos ?? analyticsMeta.tokens_aditivos);
  const adotados = Array.isArray(knapsack.adotados)
    ? knapsack.adotados.filter((value) => typeof value === "string")
    : [];

  return [
    {
      response_id: responseId,
      budget,
      adotados,
      ganho_estimado: ganhoEstimado,
      tokens_aditivos: tokensKnapsack,
    },
  ];
}

export function buildLatencyRow({
  responseId,
  analyticsMeta,
  runtime,
}: {
  responseId: string;
  analyticsMeta: ResponseAnalyticsMeta;
  runtime: { ttfb_ms?: number | null; ttlc_ms?: number | null };
}): Record<string, unknown> | null {
  const tokensTotal = asInteger(analyticsMeta.tokens_total);
  const row = {
    response_id: responseId,
    ttfb_ms: runtime.ttfb_ms ?? null,
    ttlc_ms: runtime.ttlc_ms ?? null,
    tokens_total: tokensTotal,
  };

  if (row.ttfb_ms == null && row.ttlc_ms == null && row.tokens_total == null) {
    return null;
  }

  return row;
}
