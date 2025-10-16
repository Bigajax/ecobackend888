import { getAnalyticsClient } from "./supabaseClient";
import { log } from "./promptContext/logger";

const logger = log.withContext("bandit-reward-sync");

const SYNC_INTERVAL_MS = Number(process.env.BANDIT_REWARD_SYNC_INTERVAL_MS ?? 5 * 60 * 1000);

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;
let rerunRequested = false;

async function performSync(trigger: string) {
  const analytics = getAnalyticsClient();

  const { data, error } = await analytics
    .from("eco_bandit_feedback_rewards")
    .select("arm_key, reward_sum, reward_sq_sum, feedback_count");

  if (error) {
    logger.error("bandit.sync.error", {
      trigger,
      message: error.message,
      code: error.code ?? null,
      details: error.details ?? null,
    });
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    logger.info("bandit.sync.noop", { trigger, rows: 0 });
    return;
  }

  const updates: Record<string, unknown>[] = [];

  for (const row of rows) {
    const armKey = typeof (row as any).arm_key === "string" ? ((row as any).arm_key as string).trim() : null;
    if (!armKey) continue;

    const rewardSumRaw = Number((row as any).reward_sum ?? 0);
    const feedbackCountRaw = Number((row as any).feedback_count ?? 0);
    const rewardSqSumRaw = Number((row as any).reward_sq_sum ?? rewardSumRaw);

    if (!Number.isFinite(rewardSumRaw) || !Number.isFinite(feedbackCountRaw)) {
      continue;
    }

    const pulls = Math.max(0, Math.trunc(feedbackCountRaw));
    const wins = Math.max(0, Math.min(pulls, Math.trunc(rewardSumRaw)));
    const losses = Math.max(0, pulls - wins);

    updates.push({
      arm_key: armKey,
      pulls,
      alpha: 1 + wins,
      beta: 1 + losses,
      reward_sum: wins,
      reward_sq_sum: Number.isFinite(rewardSqSumRaw) ? Math.max(0, rewardSqSumRaw) : wins,
      last_update: new Date().toISOString(),
    });
  }

  if (!updates.length) {
    logger.info("bandit.sync.noop", { trigger, rows: 0, reason: "no_valid_updates" });
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

  logger.info("bandit.sync.success", { trigger, rows: updates.length });
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
