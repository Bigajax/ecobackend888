import process from "node:process";
import { performance } from "node:perf_hooks";

import { analyticsClientMode, getAnalyticsClient } from "../services/supabaseClient";

const THRESHOLD_MINUTES = 120;

interface SnapshotRow {
  snapshot_at: string | null;
}

function logJson(payload: unknown, error = false) {
  const serialized = JSON.stringify(payload);
  if (error) {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
}

async function fetchLatestSnapshot(): Promise<Date | null> {
  if (analyticsClientMode !== "enabled") {
    throw new Error("analytics client disabled");
  }

  const analytics = getAnalyticsClient();
  const { data, error } = await analytics
    .from("bandit_posteriors_cache")
    .select("snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "fetch_failed");
  }

  const rows = (data ?? []) as SnapshotRow[];

  if (rows.length === 0 || !rows[0].snapshot_at) {
    return null;
  }

  const parsed = new Date(rows[0].snapshot_at);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function main(): Promise<void> {
  const started = performance.now();
  try {
    const latest = await fetchLatestSnapshot();
    const duration = Math.round(performance.now() - started);

    if (!latest) {
      logJson(
        {
          posterior_cache_self_test: {
            status: "stale",
            reason: "no_snapshot",
            threshold_minutes: THRESHOLD_MINUTES,
            age_minutes: null,
            duration_ms: duration,
          },
        },
        true
      );
      process.exitCode = 1;
      return;
    }

    const ageMinutes = Math.round((Date.now() - latest.getTime()) / 60000);
    const payload = {
      posterior_cache_self_test: {
        status: ageMinutes <= THRESHOLD_MINUTES ? "ok" : "stale",
        snapshot_at: latest.toISOString(),
        age_minutes: ageMinutes,
        threshold_minutes: THRESHOLD_MINUTES,
        duration_ms: duration,
      },
    };

    if (ageMinutes <= THRESHOLD_MINUTES) {
      logJson(payload);
    } else {
      logJson(payload, true);
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logJson(
      {
        posterior_cache_self_test_error: {
          stage: "self_test",
          message,
        },
      },
      true
    );
    process.exitCode = 1;
  }
}

void main();

