import { getAnalyticsClient } from "./supabaseClient";
import { log } from "./promptContext/logger";

const logger = log.withContext("bandit-reward-sync");

export const BANDIT_REWARD_VIEW = process.env.BANDIT_REWARD_VIEW ?? "eco_bandit_feedback_rewards";

const SYNC_INTERVAL_MS = Number(process.env.BANDIT_REWARD_SYNC_INTERVAL_MS ?? 5 * 60 * 1000);

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;
let rerunRequested = false;

async function performSync(trigger: string) {
  const analytics = getAnalyticsClient();
  const startedAt = Date.now();

  const { data, error } = await analytics
    .from(BANDIT_REWARD_VIEW)
    .select("arm_key, reward_sum, reward_sq_sum, feedback_count");

  if (error) {
    if (error.code === "42P01") {
      logger.warn("bandit.sync.missing_view", { trigger });
    } else {
      logger.error("bandit.sync.error", {
        trigger,
        message: error.message,
        code: error.code ?? null,
        details: error.details ?? null,
      });
    }
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    logger.info("bandit.sync", {
      trigger,
      touched_arms: 0,
      avg_reward: null,
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  const validRows = rows
    .map(row => ({
      arm_key: typeof (row as any).arm_key === "string" ? ((row as any).arm_key as string).trim() : null,
      reward_sum: Number((row as any).reward_sum ?? 0),
      reward_sq_sum: Number((row as any).reward_sq_sum ?? 0),
      feedback_count: Number((row as any).feedback_count ?? 0),
    }))
    .filter(row => row.arm_key && Number.isFinite(row.feedback_count) && Number.isFinite(row.reward_sum));

  const uniqueArmKeys = Array.from(new Set(validRows.map(row => row.arm_key as string)));

  if (!uniqueArmKeys.length) {
    logger.info("bandit.sync", {
      trigger,
      touched_arms: 0,
      avg_reward: null,
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  const existingMap = new Map<string, {
    pulls: number;
    reward_sum: number;
    reward_sq_sum: number;
  }>();

  const { data: existingArms, error: existingError } = await analytics
    .from("eco_bandit_arms")
    .select("arm_key, pulls, reward_sum, reward_sq_sum")
    .in("arm_key", uniqueArmKeys);

  if (existingError) {
    logger.error("bandit.sync.load_error", {
      trigger,
      message: existingError.message,
      code: existingError.code ?? null,
      details: existingError.details ?? null,
    });
    return;
  }

  if (Array.isArray(existingArms)) {
    for (const arm of existingArms) {
      const key = typeof (arm as any).arm_key === "string" ? (arm as any).arm_key : null;
      if (!key) continue;
      const pulls = Number((arm as any).pulls ?? 0);
      const rewardSum = Number((arm as any).reward_sum ?? 0);
      const rewardSqSum = Number((arm as any).reward_sq_sum ?? 0);

      existingMap.set(key, {
        pulls: Number.isFinite(pulls) ? Math.max(0, Math.trunc(pulls)) : 0,
        reward_sum: Number.isFinite(rewardSum) ? Math.max(0, Math.trunc(rewardSum)) : 0,
        reward_sq_sum: Number.isFinite(rewardSqSum) ? Math.max(0, rewardSqSum) : 0,
      });
    }
  }

  const updates: Record<string, unknown>[] = [];
  let touchedArms = 0;
  let rewardDelta = 0;
  let pullDelta = 0;

  for (const row of validRows) {
    const armKey = row.arm_key as string;
    const existing = existingMap.get(armKey) ?? { pulls: 0, reward_sum: 0, reward_sq_sum: 0 };

    const viewPulls = Math.max(0, Math.trunc(row.feedback_count));
    const viewReward = Math.max(0, Math.trunc(row.reward_sum));
    const viewWins = Math.max(0, Math.min(viewReward, viewPulls));
    const viewRewardSq = Number.isFinite(row.reward_sq_sum) ? Math.max(0, Number(row.reward_sq_sum)) : viewWins;

    const deltaPulls = Math.max(0, viewPulls - existing.pulls);
    const deltaWins = Math.max(0, viewWins - existing.reward_sum);
    const deltaRewardSq = Math.max(0, viewRewardSq - existing.reward_sq_sum);

    if (deltaPulls <= 0 && deltaWins <= 0 && deltaRewardSq <= 0) {
      continue;
    }

    const nextPulls = existing.pulls + deltaPulls;
    const nextRewardSum = existing.reward_sum + deltaWins;
    const nextRewardSqSum = existing.reward_sq_sum + deltaRewardSq;
    const lossesTotal = Math.max(0, nextPulls - nextRewardSum);
    const effectivePullDelta =
      deltaPulls > 0 ? deltaPulls : deltaWins > 0 ? deltaWins : deltaRewardSq > 0 ? deltaRewardSq : 0;

    existingMap.set(armKey, {
      pulls: nextPulls,
      reward_sum: nextRewardSum,
      reward_sq_sum: nextRewardSqSum,
    });

    updates.push({
      arm_key: armKey,
      pulls: nextPulls,
      reward_sum: nextRewardSum,
      reward_sq_sum: nextRewardSqSum,
      alpha: 1 + nextRewardSum,
      beta: 1 + lossesTotal,
      last_update: new Date().toISOString(),
    });

    touchedArms += 1;
    rewardDelta += deltaWins;
    pullDelta += effectivePullDelta;
  }

  if (!updates.length) {
    logger.info("bandit.sync", {
      trigger,
      touched_arms: 0,
      avg_reward: null,
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  const { error: upsertError } = await analytics
    .from("eco_bandit_arms")
    .upsert(updates, { onConflict: "arm_key" });

  if (upsertError) {
    logger.error("bandit.sync.upsert_error", {
      trigger,
      message: upsertError.message,
      code: upsertError.code ?? null,
      details: upsertError.details ?? null,
    });
    return;
  }

  logger.info("bandit.sync", {
    trigger,
    touched_arms: touchedArms,
    avg_reward: pullDelta > 0 ? rewardDelta / pullDelta : null,
    duration_ms: Date.now() - startedAt,
  });
}

async function runSync(trigger: string) {
  if (running) {
    rerunRequested = true;
    return;
  }

  running = true;
  rerunRequested = false;

  try {
    await performSync(trigger);
  } catch (error) {
    logger.error("bandit.sync.exception", {
      trigger,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
    if (rerunRequested) {
      rerunRequested = false;
      void runSync("rerun");
    }
  }
}

export function requestBanditRewardSync(trigger: string) {
  if (process.env.BANDIT_REWARD_SYNC_DISABLED === "1") {
    logger.info("bandit.sync.disabled", { trigger });
    return;
  }

  void runSync(trigger);
}

function ensureInterval() {
  if (intervalHandle || process.env.BANDIT_REWARD_SYNC_DISABLED === "1") {
    return;
  }

  intervalHandle = setInterval(() => {
    void runSync("interval");
  }, SYNC_INTERVAL_MS);

  if (typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }
}

export function startBanditRewardSyncScheduler() {
  ensureInterval();
  requestBanditRewardSync("startup");
}
