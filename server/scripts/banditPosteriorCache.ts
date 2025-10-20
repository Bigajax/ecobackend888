import process from "node:process";
import { performance } from "node:perf_hooks";

import { ensureModuleManifest, listManifestFamilies, listManifestModulesByFamily } from "../services/promptContext/moduleManifest";
import { qualityAnalyticsStore } from "../services/analytics/analyticsStore";
import { analyticsClientMode, getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";

interface PosteriorRow {
  family: string;
  arm_id: string;
  alpha: number;
  beta: number;
  samples: number;
  mean_reward: number;
}

const logger = log.withContext("posterior-cache");

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Number(value.toFixed(6));
}

async function hydrateManifestArms(): Promise<void> {
  await ensureModuleManifest();
  const families = listManifestFamilies();
  if (families.length === 0) {
    return;
  }

  const pending: Promise<unknown>[] = [];
  const storeAny = qualityAnalyticsStore as unknown as {
    banditHistoryLoading?: Map<string, Promise<void>>;
  };

  for (const family of families) {
    const arms = listManifestModulesByFamily(family.id);
    for (const arm of arms) {
      qualityAnalyticsStore.getBanditPosterior(family.id, arm.id);
    }
  }

  const loadingMap = storeAny.banditHistoryLoading;
  if (loadingMap && loadingMap.size > 0) {
    for (const promise of loadingMap.values()) {
      pending.push(promise.catch(() => undefined));
    }
  }

  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
}

async function collectPosteriors(): Promise<PosteriorRow[]> {
  await hydrateManifestArms();
  const dump = qualityAnalyticsStore.dumpBanditPosteriors();
  return dump.map((entry) => ({
    family: entry.family,
    arm_id: entry.arm_id,
    alpha: entry.alpha,
    beta: entry.beta,
    samples: entry.samples,
    mean_reward: clamp01(entry.mean_reward),
  }));
}

async function insertPosteriors(rows: PosteriorRow[], snapshotAtIso: string): Promise<void> {
  if (analyticsClientMode !== "enabled") {
    logger.error("posterior_cache_client_disabled", { stage: "client_init" });
    throw new Error("analytics client disabled");
  }

  const analytics = getAnalyticsClient();
  const chunkSize = 500;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({
      family: row.family,
      arm_id: row.arm_id,
      alpha: row.alpha,
      beta: row.beta,
      samples: row.samples,
      mean_reward: row.mean_reward,
      snapshot_at: snapshotAtIso,
    }));

    const { error } = await analytics.from("bandit_posteriors_cache").insert(chunk);
    if (error) {
      throw new Error(error.message ?? "insert_failed");
    }
  }
}

async function main(): Promise<void> {
  const start = performance.now();
  const snapshotAt = new Date();
  try {
    const rows = await collectPosteriors();
    if (rows.length === 0) {
      console.log(
        JSON.stringify({
          posterior_cache: {
            inserted: 0,
            reason: "empty_dump",
            snapshot_at: snapshotAt.toISOString(),
            duration_ms: Math.round(performance.now() - start),
          },
        })
      );
      return;
    }

    try {
      await insertPosteriors(rows, snapshotAt.toISOString());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          posterior_cache_error: {
            stage: "db_insert",
            message,
          },
        })
      );
      process.exitCode = 1;
      return;
    }

    const families = new Set(rows.map((row) => row.family));
    const arms = new Set(rows.map((row) => `${row.family}::${row.arm_id}`));

    console.log(
      JSON.stringify({
        posterior_cache: {
          inserted: rows.length,
          families: families.size,
          arms: arms.size,
          snapshot_at: snapshotAt.toISOString(),
          duration_ms: Math.round(performance.now() - start),
        },
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        posterior_cache_error: {
          stage: "collect",
          message,
        },
      })
    );
    process.exitCode = 1;
  }
}

void main();
