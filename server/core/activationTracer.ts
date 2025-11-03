import { randomUUID } from "crypto";

export type ActivationTraceHeuristic = { key: string; evidence?: any };
export type ActivationTraceModule = { name: string; reason: string | null; mode: string | null };
export type ActivationTraceEmbedding = { hits: number; similarity: number | null; threshold: number | null } | null;
export type ActivationTraceMemoryDecision = {
  willSave: boolean | null;
  intensity: number | null;
  reason: string | null;
} | null;
export type ActivationTraceError = { where: string; message: string };
export type ActivationTraceMetadata = Record<string, unknown>;

export interface ActivationTraceSnapshot {
  traceId: string;
  userId: string | null;
  model: string | null;
  cacheStatus: "hit" | "miss" | null;
  heuristics: ActivationTraceHeuristic[];
  modules: ActivationTraceModule[];
  embeddingResult: ActivationTraceEmbedding;
  memoryDecision: ActivationTraceMemoryDecision;
  latency: {
    promptReadyMs?: number | null;
    firstTokenMs?: number | null;
    totalMs?: number | null;
  };
  errors: ActivationTraceError[];
  metadata: ActivationTraceMetadata;
  startedAt: string;
  finishedAt?: string | null;
}

export class ActivationTracer {
  private readonly startAt: number;
  private finishedAt: number | null = null;
  private readonly data: ActivationTraceSnapshot;

  constructor(options: { userId?: string | null; model?: string | null; startedAt?: number } = {}) {
    const startAt = typeof options.startedAt === "number" ? options.startedAt : Date.now();
    this.startAt = startAt;
    this.data = {
      traceId: randomUUID(),
      userId: options.userId ?? null,
      model: options.model ?? null,
      cacheStatus: null,
      heuristics: [],
      modules: [],
      embeddingResult: null,
      memoryDecision: null,
      latency: {},
      errors: [],
      metadata: {},
      startedAt: new Date(startAt).toISOString(),
      finishedAt: null,
    };
  }

  get traceId(): string {
    return this.data.traceId;
  }

  setUserId(userId: string | null | undefined) {
    this.data.userId = userId ?? null;
  }

  setModel(model: string | null | undefined) {
    this.data.model = model ?? null;
  }

  addHeuristic(key: string | null | undefined, evidence?: any) {
    const normalizedKey = typeof key === "string" && key.trim().length ? key : "unknown";
    this.data.heuristics.push({ key: normalizedKey, evidence });
  }

  addModule(name: string, reason?: string | null, mode?: string | null) {
    const normalizedName = typeof name === "string" && name.trim().length ? name : "unknown";
    this.data.modules.push({
      name: normalizedName,
      reason: reason ?? null,
      mode: mode ?? null,
    });
  }

  setEmbeddingResult(result: { hits?: number; similarity?: number | null; threshold?: number | null }) {
    const hits = typeof result.hits === "number" && Number.isFinite(result.hits) ? result.hits : 0;
    const similarity =
      typeof result.similarity === "number" && Number.isFinite(result.similarity)
        ? result.similarity
        : null;
    const threshold =
      typeof result.threshold === "number" && Number.isFinite(result.threshold)
        ? result.threshold
        : null;
    this.data.embeddingResult = { hits, similarity, threshold };
  }

  markCache(status: "hit" | "miss") {
    this.data.cacheStatus = status;
  }

  private computeElapsed(at?: number): number {
    const timestamp = typeof at === "number" && Number.isFinite(at) ? at : Date.now();
    return Math.max(0, Math.round(timestamp - this.startAt));
  }

  markPromptReady(at?: number) {
    if (this.data.latency.promptReadyMs != null) return;
    this.data.latency.promptReadyMs = this.computeElapsed(at);
  }

  markFirstToken(at?: number) {
    if (this.data.latency.firstTokenMs != null) return;
    this.data.latency.firstTokenMs = this.computeElapsed(at);
  }

  markTotal(at?: number) {
    if (this.data.latency.totalMs != null) return;
    const elapsed = this.computeElapsed(at);
    this.data.latency.totalMs = elapsed;
    const finalTimestamp =
      typeof at === "number" && Number.isFinite(at) ? at : this.startAt + elapsed;
    this.finishedAt = finalTimestamp;
    this.data.finishedAt = new Date(finalTimestamp).toISOString();
  }

  setMemoryDecision(willSave: boolean | null | undefined, intensity?: number | null, reason?: string | null) {
    this.data.memoryDecision = {
      willSave: willSave ?? null,
      intensity: typeof intensity === "number" && Number.isFinite(intensity) ? intensity : null,
      reason: reason ?? null,
    };
  }

  addError(where: string, message: string) {
    const normalizedWhere = typeof where === "string" && where.trim().length ? where : "unknown";
    const normalizedMessage = typeof message === "string" ? message : String(message);
    this.data.errors.push({ where: normalizedWhere, message: normalizedMessage });
  }

  mergeMetadata(extra: ActivationTraceMetadata | null | undefined) {
    if (!extra || typeof extra !== "object") return;
    this.data.metadata = { ...this.data.metadata, ...extra };
  }

  snapshot(): ActivationTraceSnapshot {
    const clone: ActivationTraceSnapshot = JSON.parse(JSON.stringify({ ...this.data }));
    if (!clone.finishedAt && this.finishedAt) {
      clone.finishedAt = new Date(this.finishedAt).toISOString();
    }
    return clone;
  }
}

const TRACE_STORE = new Map<string, ActivationTraceSnapshot>();
const MAX_TRACES = 500;

export function saveActivationTrace(snapshot: ActivationTraceSnapshot) {
  TRACE_STORE.set(snapshot.traceId, snapshot);
  if (TRACE_STORE.size > MAX_TRACES) {
    const firstKey = TRACE_STORE.keys().next().value as string | undefined;
    if (firstKey) {
      TRACE_STORE.delete(firstKey);
    }
  }
}

export function getActivationTrace(traceId: string): ActivationTraceSnapshot | null {
  return TRACE_STORE.get(traceId) ?? null;
}
