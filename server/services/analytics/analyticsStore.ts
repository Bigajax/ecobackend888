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

class AnalyticsStore {
  private quality: QualitySample[] = [];

  private moduleOutcomes = new Map<string, ModuleOutcomeSample[]>();

  private banditOutcomes = new Map<string, BanditArmSample[]>();

  private persistenceHandler: PersistenceHandler | null = null;

  setPersistence(handler: PersistenceHandler | null): void {
    this.persistenceHandler = handler;
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
    const normalized = this.normalizeReward(outcome.reward);
    const reward = Number.isFinite(outcome.reward) ? Number(outcome.reward) : 0;
    const sample: BanditArmSample = {
      timestamp: Date.now(),
      normalized,
      reward,
      isWin: reward > 0,
    };
    const list = this.banditOutcomes.get(key) ?? [];
    list.push(sample);
    this.banditOutcomes.set(key, list);
    this.pruneBandit(key);
  }

  getBanditPosterior(pilar: string, arm: string): BanditArmPosterior {
    const key = this.banditKey(pilar, arm);
    if (!key) {
      return this.emptyPosterior();
    }
    this.pruneBandit(key);
    const samples = this.banditOutcomes.get(key) ?? [];
    if (samples.length === 0) {
      return this.emptyPosterior();
    }

    const count = samples.length;
    const sumNormalized = samples.reduce((acc, item) => acc + item.normalized, 0);
    const alpha = 1 + sumNormalized;
    const beta = 1 + count - sumNormalized;
    const rewardMean =
      samples.reduce((acc, item) => acc + item.reward, 0) / Math.max(1, count);
    const winRate =
      samples.reduce((acc, item) => acc + (item.isWin ? 1 : 0), 0) /
      Math.max(1, count);
    const lastUpdated = samples[count - 1]?.timestamp ?? null;

    return {
      alpha,
      beta,
      count,
      normalizedMean: sumNormalized / count,
      rewardMean,
      winRate,
      lastUpdated,
    };
  }

  reset(): void {
    this.quality = [];
    this.moduleOutcomes.clear();
    this.banditOutcomes.clear();
  }

  private pruneQuality(): void {
    const cutoff = Date.now() - 7 * DAY_MS;
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
    const cutoff = Date.now() - 7 * DAY_MS;
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
    const cutoff = Date.now() - 7 * DAY_MS;
    const entries = this.banditOutcomes.get(key);
    if (!entries || entries.length === 0) return;
    const filtered = entries.filter((sample) => sample.timestamp >= cutoff);
    if (filtered.length === 0) {
      this.banditOutcomes.delete(key);
    } else if (filtered.length !== entries.length) {
      this.banditOutcomes.set(key, filtered);
    }
  }

  private banditKey(pilar: string, arm: string): string | null {
    const p = typeof pilar === "string" ? pilar.trim() : "";
    const a = typeof arm === "string" ? arm.trim() : "";
    if (!p || !a) return null;
    return `${p.toLowerCase()}::${a.toLowerCase()}`;
  }

  private normalizeReward(reward: number): number {
    if (!Number.isFinite(reward)) return 0.5;
    const scaled = (reward + 1) / 2;
    const clamped = Math.max(0.001, Math.min(0.999, scaled));
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
