export interface LatencyMetrics {
  ttfb_ms?: number | null;
  ttlc_ms?: number | null;
}

export interface RuntimeMetrics {
  latency: LatencyMetrics;
}
