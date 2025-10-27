import type { RetrieveMode } from "../supabase/memoriaRepository";

type ResponseBanditReward = {
  interaction_id: string | null;
  family: string;
  arm_id: string;
  chosen_by: "ts" | "baseline" | "shadow";
  reward_key: string | null;
  reward: number | null;
  reward_reason: string | null;
  tokens: number | null;
  tokens_cap: number | null;
  tokens_planned: number | null;
  ttfb_ms: number | null;
  ttlc_ms: number | null;
  like: number | null;
  like_source: string | null;
  dislike_reason: string | null;
  emotional_intensity: number | null;
  memory_saved: boolean | null;
  reply_within_10m: boolean | null;
  user_id: string | null;
  guest_id: string | null;
  meta: Record<string, unknown> | null;
};

type PersistedBiasSnapshot = {
  bias: string;
  confidence: number;
  decay_applied: boolean;
  source: string;
  last_seen_at: string | null;
};

type ResponseHeuristicsEvent = {
  interaction_id: string | null;
  active_biases: PersistedBiasSnapshot[];
  decayed_active_biases: string[];
  meta: Record<string, unknown> | null;
};

export type ResponseAnalyticsMeta = {
  response_id: string | null;
  q?: number;
  estruturado_ok?: boolean;
  memoria_ok?: boolean;
  bloco_ok?: boolean;
  tokens_total?: number | null;
  tokens_aditivos?: number | null;
  mem_count?: number;
  bandit_rewards?: Array<ResponseBanditReward | null | undefined>;
  module_outcomes?: Array<{ module_id: string; tokens: number; q: number; vpt: number | null }>;
  heuristics_events?: Array<ResponseHeuristicsEvent | null | undefined>;
  knapsack?: {
    budget: number | null;
    adotados: string[];
    ganho_estimado: number | null;
    tokens_aditivos: number | null;
  } | null;
  latency?: { ttfb_ms: number | null; ttlc_ms: number | null; tokens_total: number | null };
};

export type PersistAnalyticsOptions = {
  result: import("../../utils").GetEcoResult;
  retrieveMode: RetrieveMode;
  activationTracer?: import("../../core/activationTracer").ActivationTracer | null;
  userId?: string | null;
};
