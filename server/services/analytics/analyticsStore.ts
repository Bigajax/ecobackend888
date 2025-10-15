interface QualitySample {
  timestamp: number;
  q: number;
  estruturado_ok: boolean;
  memoria_ok: boolean;
  bloco_ok: boolean;
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

class AnalyticsStore {
  private quality: QualitySample[] = [];

  private persistenceHandler: PersistenceHandler | null = null;

  setPersistence(handler: PersistenceHandler | null): void {
    this.persistenceHandler = handler;
  }

  recordQualitySample(sample: QualitySample): QualitySnapshot {
    this.quality.push(sample);
    this.prune();
    const snapshot = this.computeSnapshot();
    if (this.persistenceHandler) {
      Promise.resolve()
        .then(() => this.persistenceHandler?.(snapshot))
        .catch(() => undefined);
    }
    return snapshot;
  }

  getQualitySnapshot(): QualitySnapshot {
    this.prune();
    return this.computeSnapshot();
  }

  reset(): void {
    this.quality = [];
  }

  private prune(): void {
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
