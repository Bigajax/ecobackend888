import process from "node:process";
import { performance } from "node:perf_hooks";

import { analyticsClientMode, getAnalyticsClient } from "../services/supabaseClient";

interface CliOptions {
  windowLabel: string;
  windowMs: number;
  tolerateCap: number;
  allowOffline: boolean;
}

class AnalyticsUnavailableError extends Error {
  constructor(
    readonly stage: "client_init" | "bandit_rewards" | "module_usages" | "unknown",
    readonly reason: string,
    options?: { cause?: unknown }
  ) {
    super(`analytics unavailable (${stage}): ${reason}`, options);
    this.name = "AnalyticsUnavailableError";
  }
}

function isFetchUnavailableError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const candidate = error instanceof Error ? error : null;
  const message = candidate?.message ?? (typeof error === "string" ? error : "");
  if (typeof message === "string") {
    const normalized = message.toLowerCase();
    if (
      normalized.includes("fetch failed") ||
      normalized.includes("getaddrinfo") ||
      normalized.includes("etimedout") ||
      normalized.includes("econnrefused") ||
      normalized.includes("network timeout")
    ) {
      return true;
    }
  }
  const errorCode = (candidate as { code?: unknown } | null)?.code;
  if (typeof errorCode === "string") {
    const normalizedCode = errorCode.toLowerCase();
    if (
      normalizedCode === "etimedout" ||
      normalizedCode === "econnrefused" ||
      normalizedCode === "enotfound" ||
      normalizedCode === "fetch_failed"
    ) {
      return true;
    }
  }
  return candidate instanceof TypeError && candidate.message.includes("fetch");
}

function handleAnalyticsUnavailable(
  options: CliOptions,
  payload: { stage: AnalyticsUnavailableError["stage"]; reason: string }
): void {
  const serialized = JSON.stringify({
    pilot_health_skipped: {
      window: options.windowLabel,
      stage: payload.stage,
      reason: payload.reason,
      allow_offline: options.allowOffline,
    },
  });
  if (options.allowOffline) {
    console.warn(serialized);
    return;
  }
  console.error(serialized);
  process.exitCode = 1;
}

interface RawBanditRewardRow {
  family?: string | null;
  pilar?: string | null;
  arm_id?: string | null;
  arm?: string | null;
  reward?: number | null;
  recompensa?: number | null;
  tokens?: number | null;
  chosen_by?: string | null;
  meta?: unknown;
  created_at?: string | null;
  response_id?: string | null;
  interaction_id?: string | null;
  ttlc_ms?: number | null;
}

interface RawModuleUsageRow {
  interaction_id?: string | null;
  response_id?: string | null;
  tokens?: number | null;
}

interface ProcessedRow {
  family: string;
  chosenBy: "ts" | "baseline" | "shadow" | "other";
  reward: number;
  tokens: number | null;
  ttlc: number | null;
  capViolation: boolean;
}

interface FamilyAggregate {
  family: string;
  events: number;
  tsEvents: number;
  baselineEvents: number;
  rewardSumTs: number;
  rewardSumBaseline: number;
  tokenSumTs: number;
  tokenSumBaseline: number;
  tokenCountTs: number;
  tokenCountBaseline: number;
  ttlcTs: number[];
  ttlcBaseline: number[];
  capViolations: number;
}

interface FamilyReport {
  family: string;
  events: number;
  reward_100t_ts: number | null;
  reward_100t_baseline: number | null;
  lift_pct: number | null;
  p95_ttlc_ts: number | null;
  p95_ttlc_baseline: number | null;
  cap_violation_rate: number | null;
  pass: boolean;
  reasons: string[];
}

interface GlobalReport {
  exploration_rate: number;
  pass: boolean;
  reasons: string[];
}

function parseWindowMs(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(`Invalid window format: ${value}`);
  }
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid window amount: ${value}`);
  }
  switch (unit) {
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unsupported window unit: ${unit}`);
  }
}

function parseCli(argv: string[]): CliOptions {
  let windowLabel = "24h";
  let tolerateCap = 0;
  let allowOffline = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg.startsWith("--window") || arg.startsWith("--range")) {
      const value = arg.includes("=") ? arg.split("=", 2)[1] ?? "" : argv[i + 1] ?? "";
      if (!value) {
        throw new Error("--window flag requires a value");
      }
      windowLabel = value;
      if (!arg.includes("=")) {
        i += 1;
      }
    } else if (arg.startsWith("--tolerate-cap")) {
      const value = arg.includes("=") ? arg.split("=", 2)[1] ?? "" : argv[i + 1] ?? "";
      if (!value) {
        throw new Error("--tolerate-cap flag requires a value");
      }
      const numeric = Number.parseFloat(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        throw new Error(`Invalid tolerate-cap value: ${value}`);
      }
      tolerateCap = numeric / 100;
      if (!arg.includes("=")) {
        i += 1;
      }
    } else if (arg === "--allow-offline" || arg === "--offline-ok") {
      allowOffline = true;
    }
  }

  return { windowLabel, windowMs: parseWindowMs(windowLabel), tolerateCap, allowOffline };
}

function clamp01(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }
  const numeric = Number(value);
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return Number(numeric.toFixed(6));
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseMeta(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function isCapViolation(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  const withinCap = meta?.["within_cap"];
  if (typeof withinCap === "boolean") {
    return !withinCap;
  }
  if (typeof withinCap === "string") {
    const normalized = withinCap.toLowerCase();
    if (normalized === "false") return true;
    if (normalized === "true") return false;
  }
  const penalty = meta?.["penalty"] ?? meta?.["token_penalty"];
  if (typeof penalty === "boolean") {
    return penalty;
  }
  if (typeof penalty === "string") {
    const normalized = penalty.toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
  }
  if (typeof penalty === "number") {
    return penalty > 0;
  }
  return false;
}

function computePercentile(values: number[], percentile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * percentile;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower] ?? null;
  }
  const weight = rank - lower;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? 0;
  return lowerValue + (upperValue - lowerValue) * weight;
}

async function fetchBanditRewards(sinceIso: string): Promise<RawBanditRewardRow[]> {
  if (analyticsClientMode !== "enabled") {
    throw new AnalyticsUnavailableError("client_init", "analytics_disabled");
  }
  const client = getAnalyticsClient();
  const selections = [
    "family,pilar,arm_id,arm,reward,recompensa,tokens,chosen_by,meta,created_at,response_id,interaction_id,ttlc_ms",
    "family,pilar,arm_id,arm,reward,recompensa,tokens,chosen_by,meta,created_at,response_id,interaction_id",
    "*",
  ];
  for (const columns of selections) {
    const rows: RawBanditRewardRow[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const query = client
        .from("bandit_rewards")
        .select(columns)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      let response;
      try {
        response = await query;
      } catch (error) {
        if (isFetchUnavailableError(error)) {
          throw new AnalyticsUnavailableError("bandit_rewards", "fetch_failed", { cause: error });
        }
        throw error;
      }
      const { data, error } = response;
      if (error) {
        if (error.code === "42703") {
          break;
        }
        if (isFetchUnavailableError(error)) {
          throw new AnalyticsUnavailableError("bandit_rewards", "fetch_failed", { cause: error });
        }
        throw new Error(error.message ?? "bandit_rewards_fetch_failed");
      }
      const batch = (data ?? []) as RawBanditRewardRow[];
      rows.push(...batch);
      if (batch.length < pageSize) {
        return rows;
      }
      from += pageSize;
    }
  }
  throw new Error("bandit_rewards_select_failed");
}

async function fetchModuleUsageTotals(sinceIso: string): Promise<Map<string, number>> {
  if (analyticsClientMode !== "enabled") {
    throw new AnalyticsUnavailableError("client_init", "analytics_disabled");
  }
  const client = getAnalyticsClient();
  const totals = new Map<string, number>();
  const selections = [
    "interaction_id,response_id,tokens,created_at",
    "interaction_id,tokens,created_at",
    "*",
  ];
  for (const columns of selections) {
    totals.clear();
    let from = 0;
    const pageSize = 1000;
    let encounteredColumnError = false;
    while (true) {
      const query = client
        .from("eco_module_usages")
        .select(columns)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      let response;
      try {
        response = await query;
      } catch (error) {
        if (isFetchUnavailableError(error)) {
          throw new AnalyticsUnavailableError("module_usages", "fetch_failed", { cause: error });
        }
        throw error;
      }
      const { data, error } = response;
      if (error) {
        if (error.code === "42703") {
          encounteredColumnError = true;
          break;
        }
        if (isFetchUnavailableError(error)) {
          throw new AnalyticsUnavailableError("module_usages", "fetch_failed", { cause: error });
        }
        throw new Error(error.message ?? "module_usages_fetch_failed");
      }
      const batch = (data ?? []) as RawModuleUsageRow[];
      for (const row of batch) {
        const tokens = coerceNumber(row.tokens);
        if (!tokens || tokens <= 0) continue;
        const interactionId = typeof row.interaction_id === "string" ? row.interaction_id : null;
        const responseId = typeof row.response_id === "string" ? row.response_id : null;
        if (interactionId) {
          totals.set(interactionId, (totals.get(interactionId) ?? 0) + tokens);
        }
        if (responseId && responseId !== interactionId) {
          totals.set(responseId, (totals.get(responseId) ?? 0) + tokens);
        }
      }
      if (batch.length < pageSize) {
        return totals;
      }
      from += pageSize;
    }
    if (!encounteredColumnError) {
      return totals;
    }
  }
  throw new Error("module_usages_select_failed");
}

function normalizeRows(
  rows: RawBanditRewardRow[],
  usageTotals: Map<string, number>
): ProcessedRow[] {
  const normalized: ProcessedRow[] = [];
  for (const row of rows) {
    const familyRaw = typeof row.family === "string" && row.family.trim()
      ? row.family.trim()
      : typeof row.pilar === "string" && row.pilar.trim()
      ? row.pilar.trim()
      : null;
    if (!familyRaw) continue;
    const family = familyRaw.toLowerCase();
    const chosenRaw = typeof row.chosen_by === "string" ? row.chosen_by.toLowerCase() : null;
    let chosenBy: ProcessedRow["chosenBy"] = "baseline";
    if (chosenRaw === "ts") {
      chosenBy = "ts";
    } else if (chosenRaw === "shadow") {
      chosenBy = "shadow";
    } else if (chosenRaw === "baseline" || chosenRaw === "control") {
      chosenBy = "baseline";
    } else if (chosenRaw) {
      chosenBy = "other";
    }
    const rewardNumeric =
      coerceNumber(row.reward) ?? coerceNumber(row.recompensa) ?? 0;
    const rewardValue = clamp01(rewardNumeric);
    const tokensRaw = coerceNumber(row.tokens);
    const interactionId = typeof row.interaction_id === "string" ? row.interaction_id : null;
    const responseId = typeof row.response_id === "string" ? row.response_id : null;
    let resolvedTokens = tokensRaw;
    if ((resolvedTokens == null || resolvedTokens <= 0) && interactionId) {
      resolvedTokens = usageTotals.get(interactionId) ?? resolvedTokens;
    }
    if ((resolvedTokens == null || resolvedTokens <= 0) && responseId) {
      resolvedTokens = usageTotals.get(responseId) ?? resolvedTokens;
    }
    if (resolvedTokens != null && resolvedTokens < 0) {
      resolvedTokens = 0;
    }
    const ttlc = coerceNumber(row.ttlc_ms);
    const meta = parseMeta(row.meta);
    const ttlcFromMeta = meta ? coerceNumber(meta["ttlc_ms"]) : null;
    normalized.push({
      family,
      chosenBy,
      reward: rewardValue,
      tokens: resolvedTokens ?? null,
      ttlc: ttlc ?? ttlcFromMeta,
      capViolation: isCapViolation(meta),
    });
  }
  return normalized;
}

function ensureAggregate(map: Map<string, FamilyAggregate>, family: string): FamilyAggregate {
  let aggregate = map.get(family);
  if (!aggregate) {
    aggregate = {
      family,
      events: 0,
      tsEvents: 0,
      baselineEvents: 0,
      rewardSumTs: 0,
      rewardSumBaseline: 0,
      tokenSumTs: 0,
      tokenSumBaseline: 0,
      tokenCountTs: 0,
      tokenCountBaseline: 0,
      ttlcTs: [],
      ttlcBaseline: [],
      capViolations: 0,
    };
    map.set(family, aggregate);
  }
  return aggregate;
}

function buildReports(
  rows: ProcessedRow[],
  tolerateCap: number
): { reports: FamilyReport[]; global: GlobalReport } {
  const aggregates = new Map<string, FamilyAggregate>();
  let globalTsEvents = 0;
  let globalBaselineEvents = 0;

  for (const row of rows) {
    const aggregate = ensureAggregate(aggregates, row.family);
    aggregate.events += 1;
    if (row.capViolation) {
      aggregate.capViolations += 1;
    }
    if (row.chosenBy === "ts") {
      aggregate.tsEvents += 1;
      globalTsEvents += 1;
      aggregate.rewardSumTs += row.reward;
      if (row.tokens != null && row.tokens > 0) {
        aggregate.tokenSumTs += row.tokens;
        aggregate.tokenCountTs += 1;
      }
      if (row.ttlc != null && row.ttlc > 0) {
        aggregate.ttlcTs.push(row.ttlc);
      }
    } else if (row.chosenBy === "baseline") {
      aggregate.baselineEvents += 1;
      globalBaselineEvents += 1;
      aggregate.rewardSumBaseline += row.reward;
      if (row.tokens != null && row.tokens > 0) {
        aggregate.tokenSumBaseline += row.tokens;
        aggregate.tokenCountBaseline += 1;
      }
      if (row.ttlc != null && row.ttlc > 0) {
        aggregate.ttlcBaseline.push(row.ttlc);
      }
    }
  }

  const reports: FamilyReport[] = [];

  for (const aggregate of aggregates.values()) {
    const reward100Ts =
      aggregate.tokenSumTs > 0
        ? Number(((aggregate.rewardSumTs / aggregate.tokenSumTs) * 100).toFixed(6))
        : null;
    const reward100Baseline =
      aggregate.tokenSumBaseline > 0
        ? Number(((aggregate.rewardSumBaseline / aggregate.tokenSumBaseline) * 100).toFixed(6))
        : null;
    const liftPct =
      reward100Baseline != null && reward100Baseline > 0 && reward100Ts != null
        ? Number((((reward100Ts - reward100Baseline) / reward100Baseline) * 100).toFixed(6))
        : null;
    const p95TtlcTs = computePercentile(aggregate.ttlcTs, 0.95);
    const p95TtlcBaseline = computePercentile(aggregate.ttlcBaseline, 0.95);
    const capViolationRate =
      aggregate.events > 0
        ? Number((aggregate.capViolations / aggregate.events).toFixed(6))
        : null;

    const reasons: string[] = [];
    if (aggregate.events < 50) {
      reasons.push("few_events");
    }
    if (aggregate.events >= 50) {
      if (aggregate.tsEvents === 0) {
        reasons.push("few_ts_events");
      }
      if (aggregate.baselineEvents === 0) {
        reasons.push("few_baseline_events");
      }
      if (reward100Ts == null) {
        reasons.push("reward_missing_ts");
      }
      if (aggregate.baselineEvents > 0 && reward100Baseline == null) {
        reasons.push("reward_missing_baseline");
      }
      if (
        reward100Baseline != null &&
        reward100Baseline > 0 &&
        reward100Ts != null &&
        reward100Ts < reward100Baseline * 1.05
      ) {
        reasons.push("low_lift");
      } else if (
        reward100Baseline == null &&
        aggregate.events >= 100 &&
        reward100Ts != null &&
        reward100Ts < 0.5
      ) {
        reasons.push("low_lift");
      }
      if (
        p95TtlcBaseline != null &&
        p95TtlcBaseline > 0 &&
        p95TtlcTs != null &&
        p95TtlcTs > p95TtlcBaseline * 1.1
      ) {
        reasons.push("latency_regression");
      }
      if (p95TtlcBaseline == null || p95TtlcTs == null) {
        reasons.push("latency_missing");
      }
      if (
        capViolationRate != null &&
        capViolationRate > tolerateCap + Number.EPSILON
      ) {
        reasons.push("cap_violations");
      }
    }

    const report: FamilyReport = {
      family: aggregate.family,
      events: aggregate.events,
      reward_100t_ts: reward100Ts,
      reward_100t_baseline: reward100Baseline,
      lift_pct: liftPct,
      p95_ttlc_ts: p95TtlcTs != null ? Number(p95TtlcTs.toFixed(2)) : null,
      p95_ttlc_baseline: p95TtlcBaseline != null ? Number(p95TtlcBaseline.toFixed(2)) : null,
      cap_violation_rate: capViolationRate,
      pass: reasons.length === 0,
      reasons,
    };
    reports.push(report);
  }

  reports.sort((a, b) => a.family.localeCompare(b.family));

  const denominator = globalTsEvents + globalBaselineEvents;
  const explorationRate = denominator > 0 ? globalTsEvents / denominator : 0;

  const failedFamilies = reports.filter(
    (report) => report.events >= 50 && !report.pass
  );
  const globalReasons = failedFamilies.map((report) => `family_failed:${report.family}`);
  if (reports.every((report) => report.events < 50)) {
    globalReasons.push("insufficient_data");
  }

  const globalPass = failedFamilies.length === 0 && globalReasons.length === 0;

  return {
    reports,
    global: {
      exploration_rate: Number(explorationRate.toFixed(6)),
      pass: globalPass,
      reasons: globalReasons,
    },
  };
}

async function main(): Promise<void> {
  const started = performance.now();
  let options: CliOptions;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ pilot_health_error: { stage: "cli", message } })
    );
    process.exitCode = 1;
    return;
  }

  if (analyticsClientMode !== "enabled") {
    handleAnalyticsUnavailable(options, {
      stage: "client_init",
      reason: "analytics_disabled",
    });
    return;
  }

  try {
    const since = new Date(Date.now() - options.windowMs);
    const sinceIso = since.toISOString();
    let banditRows: RawBanditRewardRow[];
    try {
      banditRows = await fetchBanditRewards(sinceIso);
    } catch (error) {
      if (error instanceof AnalyticsUnavailableError) {
        handleAnalyticsUnavailable(options, {
          stage: error.stage,
          reason: error.reason,
        });
        return;
      }
      if (isFetchUnavailableError(error)) {
        handleAnalyticsUnavailable(options, {
          stage: "bandit_rewards",
          reason: "fetch_failed",
        });
        return;
      }
      throw error;
    }

    let usageTotals: Map<string, number>;
    try {
      usageTotals = await fetchModuleUsageTotals(sinceIso);
    } catch (error) {
      if (error instanceof AnalyticsUnavailableError) {
        handleAnalyticsUnavailable(options, {
          stage: error.stage,
          reason: error.reason,
        });
        return;
      }
      if (isFetchUnavailableError(error)) {
        handleAnalyticsUnavailable(options, {
          stage: "module_usages",
          reason: "fetch_failed",
        });
        return;
      }
      throw error;
    }

    const normalized = normalizeRows(banditRows, usageTotals);
    if (normalized.length === 0) {
      console.error(
        JSON.stringify({
          pilot_health_error: { stage: "no_data", message: "no rows in window" },
        })
      );
      process.exitCode = 1;
      return;
    }

    const { reports, global } = buildReports(normalized, options.tolerateCap);
    const duration = Math.round(performance.now() - started);
    const payload = {
      window: options.windowLabel,
      families: reports,
      global: {
        exploration_rate: global.exploration_rate,
        pass: global.pass,
        reasons: global.reasons,
      },
      duration_ms: duration,
    };
    const serialized = JSON.stringify(payload);
    if (global.pass) {
      console.log(serialized);
    } else {
      console.error(serialized);
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof AnalyticsUnavailableError) {
      handleAnalyticsUnavailable(options, {
        stage: error.stage,
        reason: error.reason,
      });
      return;
    }
    if (isFetchUnavailableError(error)) {
      handleAnalyticsUnavailable(options, {
        stage: "unknown",
        reason: "fetch_failed",
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ pilot_health_error: { stage: "run", message } })
    );
    process.exitCode = 1;
  }
}

void main();
