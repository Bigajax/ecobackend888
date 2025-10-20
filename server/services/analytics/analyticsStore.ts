import { analyticsClientMode, getAnalyticsClient } from "../supabaseClient";
import { log } from "../promptContext/logger";

interface QualitySample {
  timestamp: number;
  q: number;
  estruturado_ok: boolean;
  memoria_ok: boolean;
  bloco_ok: boolean;
}

interface ModuleOutcomeSample {
  timestamp: number;
  q: number;
  tokens: number;
  ratio: number;
}

interface BanditArmSample {
  timestamp: number;
  normalized: number;
  reward: number;
  isWin: boolean;
}

export interface BanditArmPosterior {
  alpha: number;
  beta: number;
  count: number;
  normalizedMean: number;
  rewardMean: number;
  winRate: number;
  lastUpdated: number | null;
}

interface RollingStats {
  count: number;
  q_media: number | null;
}

export interface QualitySnapshot {
  last24h: RollingStats;
  last7d: RollingStats;
}

type PersistenceHandler = (snapshot: QualitySnapshot) => Promise<void> | void;

const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIDENCE_MIN_SAMPLES = 300;
const DEFAULT_BANDIT_WINDOW_DAYS = 14;
const DEFAULT_BANDIT_ALPHA = 1.5;
const DEFAULT_BANDIT_BETA = 1.5;
const DEFAULT_BANDIT_COLD_START = 0.35;

const banditLogger = log.withContext("quality-analytics");

interface SupabaseBanditRow {
  reward?: number | null;
  created_at?: string | null;
}

class AnalyticsStore {
  private quality: QualitySample[] = [];

  private moduleOutcomes = new Map<string, ModuleOutcomeSample[]>();

  private banditOutcomes = new Map<string, BanditArmSample[]>();

  private banditHistoryLoaded = new Set<string>();

  private banditHistoryLoading = new Map<string, Promise<void>>();

  private persistenceHandler: PersistenceHandler | null = null;

  private banditWindowMs = DEFAULT_BANDIT_WINDOW_DAYS * DAY_MS;

  private banditAlphaPrior = DEFAULT_BANDIT_ALPHA;

  private banditBetaPrior = DEFAULT_BANDIT_BETA;

  private banditColdStartBoost = DEFAULT_BANDIT_COLD_START;

  setPersistence(handler: PersistenceHandler | null): void {
    this.persistenceHandler = handler;
  }

  configureBandit(options: {
    windowDays?: number;
    alphaPrior?: number;
    betaPrior?: number;
    coldStartBoost?: number;
  }): void {
    if (options.windowDays && options.windowDays > 0) {
      this.banditWindowMs = options.windowDays * DAY_MS;
    }
    if (options.alphaPrior && options.alphaPrior > 0) {
      this.banditAlphaPrior = options.alphaPrior;
    }
    if (options.betaPrior && options.betaPrior > 0) {
      this.banditBetaPrior = options.betaPrior;
    }
    if (
      options.coldStartBoost != null &&
      options.coldStartBoost >= 0 &&
      options.coldStartBoost <= 1
    ) {
      this.banditColdStartBoost = options.coldStartBoost;
    }
  }

  recordQualitySample(sample: QualitySample): QualitySnapshot {
    this.quality.push(sample);
    this.pruneQuality();
    const snapshot = this.computeSnapshot();
    if (this.persistenceHandler) {
      Promise.resolve()
        .then(() => this.persistenceHandler?.(snapshot))
        .catch(() => undefined);
    }
    return snapshot;
  }

  getQualitySnapshot(): QualitySnapshot {
    this.pruneQuality();
    return this.computeSnapshot();
  }

  recordModuleOutcome(
    modId: string,
    outcome: { q: number; tokens: number }
  ): void {
    const id = typeof modId === "string" ? modId.trim() : "";
    if (!id) return;
    const tokens = Number.isFinite(outcome.tokens) ? Number(outcome.tokens) : 0;
    if (tokens <= 0) return;
    const q = Number.isFinite(outcome.q) ? Number(outcome.q) : 0;
    const ratio = q / tokens;
    const entry: ModuleOutcomeSample = {
      timestamp: Date.now(),
      q,
      tokens,
      ratio,
    };
    const current = this.moduleOutcomes.get(id) ?? [];
    current.push(entry);
    this.moduleOutcomes.set(id, current);
    this.pruneModule(id);
  }

  getModuleVPT(modId: string): { vptMean: number; vptCI: number | null } {
    const id = typeof modId === "string" ? modId.trim() : "";
    if (!id) return { vptMean: 0, vptCI: null };
    this.pruneModule(id);
    const samples = this.moduleOutcomes.get(id) ?? [];
    if (samples.length === 0) return { vptMean: 0, vptCI: null };

    const ratios = samples.map((sample) => sample.ratio);
    const mean = ratios.reduce((acc, value) => acc + value, 0) / ratios.length;
    if (!Number.isFinite(mean)) return { vptMean: 0, vptCI: null };

    if (ratios.length < 2) {
      return { vptMean: Number(mean.toFixed(6)), vptCI: null };
    }

    const variance =
      ratios.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
      (ratios.length - 1);
    const stdDev = Math.sqrt(Math.max(variance, 0));
    const standardError = stdDev / Math.sqrt(ratios.length);
    const ci =
      ratios.length >= CONFIDENCE_MIN_SAMPLES && Number.isFinite(standardError)
        ? 1.96 * standardError
        : null;

    return {
      vptMean: Number(mean.toFixed(6)),
      vptCI: ci != null ? Number(ci.toFixed(6)) : null,
    };
  }

  recordBanditOutcome(
    pilar: string,
    arm: string,
    outcome: { reward: number }
  ): void {
    const key = this.banditKey(pilar, arm);
    if (!key) return;
    const reward = this.clampReward(outcome.reward);
    const sample: BanditArmSample = {
      timestamp: Date.now(),
      normalized: reward,
      reward,
      isWin: reward >= 0.5,
    };
    const list = this.banditOutcomes.get(key) ?? [];
    list.push(sample);
    this.banditOutcomes.set(key, list);
    this.pruneBandit(key);

    if (
      analyticsClientMode === "enabled" &&
      !this.banditHistoryLoaded.has(key) &&
      !this.banditHistoryLoading.has(key)
    ) {
      const promise = this.hydrateBanditHistory(pilar, arm).catch(() => undefined);
      this.banditHistoryLoading.set(key, promise);
      promise.finally(() => {
        this.banditHistoryLoading.delete(key);
      });
    }
  }

  updatePosterior(params: { family: string; armId: string; reward: number }): void {
    if (!params || typeof params !== "object") return;
    this.recordBanditOutcome(params.family, params.armId, { reward: params.reward });
  }

  getBanditPosterior(pilar: string, arm: string): BanditArmPosterior {
    const key = this.banditKey(pilar, arm);
    if (!key) {
      return this.emptyPosterior();
    }
    if (
      analyticsClientMode === "enabled" &&
      !this.banditHistoryLoaded.has(key) &&
      !this.banditHistoryLoading.has(key)
    ) {
      const promise = this.hydrateBanditHistory(pilar, arm).catch(() => undefined);
      this.banditHistoryLoading.set(key, promise);
      promise.finally(() => {
        this.banditHistoryLoading.delete(key);
      });
    }
    this.pruneBandit(key);
    const samples = this.banditOutcomes.get(key) ?? [];
    if (samples.length === 0) {
      return this.emptyPosterior();
    }

    const count = samples.length;
    const sumNormalized = samples.reduce((acc, item) => acc + item.normalized, 0);
    const alpha = this.banditAlphaPrior + sumNormalized;
    const beta = this.banditBetaPrior + count - sumNormalized;
    const rewardMeanRaw =
      samples.reduce((acc, item) => acc + item.reward, 0) / Math.max(1, count);
    const winRateRaw =
      samples.reduce((acc, item) => acc + (item.isWin ? 1 : 0), 0) /
      Math.max(1, count);
    const normalizedMean = count > 0 ? sumNormalized / count : 0;
    const lastUpdated = samples[count - 1]?.timestamp ?? null;

    return {
      alpha,
      beta,
      count,
      normalizedMean: Number(normalizedMean.toFixed(6)),
      rewardMean: Number(Math.max(0, Math.min(1, rewardMeanRaw)).toFixed(6)),
      winRate: Number(Math.max(0, Math.min(1, winRateRaw)).toFixed(6)),
      lastUpdated,
    };
  }

  reset(): void {
    this.quality = [];
    this.moduleOutcomes.clear();
    this.banditOutcomes.clear();
    this.banditHistoryLoaded.clear();
    this.banditHistoryLoading.clear();
  }

  getBanditColdStartBoost(): number {
    return this.banditColdStartBoost;
  }

  dumpBanditPosteriors(): Array<{
    family: string;
    arm_id: string;
    alpha: number;
    beta: number;
    samples: number;
    mean_reward: number;
    normalized_mean: number;
    win_rate: number;
    last_updated: number | null;
  }> {
    const out: Array<{
      family: string;
      arm_id: string;
      alpha: number;
      beta: number;
      samples: number;
      mean_reward: number;
      normalized_mean: number;
      win_rate: number;
      last_updated: number | null;
    }> = [];
    for (const key of this.banditOutcomes.keys()) {
      const [pilar, arm] = key.split("::");
      const posterior = this.getBanditPosterior(pilar, arm);
      out.push({
        family: pilar,
        arm_id: arm,
        alpha: posterior.alpha,
        beta: posterior.beta,
        samples: posterior.count,
        mean_reward: Number(posterior.rewardMean.toFixed(6)),
        normalized_mean: Number(posterior.normalizedMean.toFixed(6)),
        win_rate: Number(posterior.winRate.toFixed(6)),
        last_updated: posterior.lastUpdated,
      });
    }
    return out;
  }

  private pruneQuality(): void {
    const cutoff = Date.now() - this.banditWindowMs;
    if (this.quality.length === 0) return;
    let firstValidIndex = -1;
    for (let i = 0; i < this.quality.length; i += 1) {
      if (this.quality[i]!.timestamp >= cutoff) {
        firstValidIndex = i;
        break;
      }
    }
    if (firstValidIndex > 0) {
      this.quality.splice(0, firstValidIndex);
    } else if (firstValidIndex === -1) {
      this.quality = [];
    }
  }

  private pruneModule(modId: string): void {
    const cutoff = Date.now() - this.banditWindowMs;
    const entries = this.moduleOutcomes.get(modId);
    if (!entries || entries.length === 0) return;
    const filtered = entries.filter((sample) => sample.timestamp >= cutoff);
    if (filtered.length === 0) {
      this.moduleOutcomes.delete(modId);
    } else if (filtered.length !== entries.length) {
      this.moduleOutcomes.set(modId, filtered);
    }
  }

  private pruneBandit(key: string): void {
    const cutoff = Date.now() - this.banditWindowMs;
    const entries = this.banditOutcomes.get(key);
    if (!entries || entries.length === 0) return;
    const filtered = entries.filter((sample) => sample.timestamp >= cutoff);
    if (filtered.length === 0) {
      this.banditOutcomes.delete(key);
    } else if (filtered.length !== entries.length) {
      this.banditOutcomes.set(key, filtered);
    }
  }

  private async hydrateBanditHistory(pilar: string, arm: string): Promise<void> {
    const key = this.banditKey(pilar, arm);
    if (!key) return;
    if (this.banditHistoryLoaded.has(key)) {
      return;
    }
    if (analyticsClientMode !== "enabled") {
      this.banditHistoryLoaded.add(key);
      return;
    }
    try {
      const client = getAnalyticsClient();
      const sinceIso = new Date(Date.now() - this.banditWindowMs).toISOString();
      const rows: SupabaseBanditRow[] = [];

      const collectRows = (data: unknown) => {
        if (Array.isArray(data)) {
          rows.push(...(data as SupabaseBanditRow[]));
        }
      };

      const { data: newData, error: newError } = await client
        .from("bandit_rewards")
        .select("reward, created_at")
        .gte("created_at", sinceIso)
        .eq("family", pilar)
        .eq("arm_id", arm)
        .order("created_at", { ascending: true });
      if (newError && newError.code !== "42703") {
        banditLogger.warn("bandit_history_fetch_failed", {
          family: pilar,
          arm,
          code: newError.code ?? null,
          message: newError.message,
        });
      }
      collectRows(newData);

      const { data: legacyData, error: legacyError } = await client
        .from("bandit_rewards")
        .select("reward, created_at")
        .gte("created_at", sinceIso)
        .eq("pilar", pilar)
        .eq("arm", arm)
        .order("created_at", { ascending: true });
      if (legacyError && legacyError.code !== "42703") {
        banditLogger.warn("bandit_history_legacy_failed", {
          family: pilar,
          arm,
          code: legacyError.code ?? null,
          message: legacyError.message,
        });
      }
      collectRows(legacyData);

      if (rows.length > 0) {
        const dedup = new Map<string, BanditArmSample>();
        for (const row of rows) {
          const rewardValue = typeof row.reward === "number" ? this.clampReward(row.reward) : null;
          const timestamp = row.created_at ? Date.parse(row.created_at) : Number.NaN;
          if (rewardValue == null || Number.isNaN(timestamp)) continue;
          const id = `${timestamp}::${rewardValue.toFixed(6)}`;
          dedup.set(id, {
            timestamp,
            normalized: rewardValue,
            reward: rewardValue,
            isWin: rewardValue >= 0.5,
          });
        }

        const existing = this.banditOutcomes.get(key) ?? [];
        for (const sample of existing) {
          const id = `${sample.timestamp}::${sample.reward.toFixed(6)}`;
          if (!dedup.has(id)) {
            dedup.set(id, sample);
          }
        }

        const ordered = Array.from(dedup.values()).sort((a, b) => a.timestamp - b.timestamp);
        this.banditOutcomes.set(key, ordered);
        this.pruneBandit(key);
      }

      this.banditHistoryLoaded.add(key);
    } catch (error) {
      banditLogger.warn("bandit_history_fetch_unexpected", {
        family: pilar,
        arm,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private banditKey(pilar: string, arm: string): string | null {
    const p = typeof pilar === "string" ? pilar.trim() : "";
    const a = typeof arm === "string" ? arm.trim() : "";
    if (!p || !a) return null;
    return `${p.toLowerCase()}::${a.toLowerCase()}`;
  }

  private clampReward(reward: number): number {
    if (!Number.isFinite(reward)) return 0;
    const clamped = Math.max(0, Math.min(1, reward));
    return Number(clamped.toFixed(6));
  }

  private emptyPosterior(): BanditArmPosterior {
    return {
      alpha: 1,
      beta: 1,
      count: 0,
      normalizedMean: 0.5,
      rewardMean: 0,
      winRate: 0.5,
      lastUpdated: null,
    };
  }

  private computeSnapshot(): QualitySnapshot {
    const now = Date.now();
    const last24h = this.computeWindow(now - DAY_MS);
    const last7d = this.computeWindow(now - 7 * DAY_MS);
    return { last24h, last7d };
  }

  private computeWindow(cutoff: number): RollingStats {
    const items = this.quality.filter((sample) => sample.timestamp >= cutoff);
    if (items.length === 0) {
      return { count: 0, q_media: null };
    }
    const total = items.reduce((acc, sample) => acc + sample.q, 0);
    return {
      count: items.length,
      q_media: Number((total / items.length).toFixed(4)),
    };
  }
}

export const qualityAnalyticsStore = new AnalyticsStore();
