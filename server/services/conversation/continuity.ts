import type { SimilarMemory } from "../promptContext/contextTypes";

export interface ContinuityDecision {
  hasContinuity: boolean;
  similarity: number | null;
  diasDesde: number | null;
  memoryRef: Record<string, unknown> | null;
}

interface ResolveContinuityOptions {
  threshold?: number;
  recencyDays?: number;
  now?: number;
}

type MemoryLike = SimilarMemory & {
  id?: string | null;
  memoria_id?: string | null;
  created_at?: string | null;
  dias_desde?: number | null;
  diasDesde?: number | null;
  dias?: number | null;
  similarity?: number | null;
  similaridade?: number | null;
  tags?: unknown;
  intensidade?: unknown;
  emocao_principal?: string | null;
};

function resolveSimilarity(memory: MemoryLike | null | undefined): number | null {
  if (!memory || typeof memory !== "object") return null;
  const rawSim =
    typeof memory.similarity === "number"
      ? memory.similarity
      : typeof memory.similaridade === "number"
      ? memory.similaridade
      : null;
  if (rawSim == null || Number.isNaN(rawSim)) return null;
  return Math.max(0, Math.min(1, rawSim));
}

function resolveDiasDesde(memory: MemoryLike | null | undefined, now: number): number | null {
  if (!memory || typeof memory !== "object") return null;
  const direct = [memory.dias_desde, memory.diasDesde, memory.dias]
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .find((value) => value != null);
  if (direct != null) {
    return Math.max(0, Math.floor(direct));
  }

  const createdAt =
    typeof memory.created_at === "string" && memory.created_at.trim().length
      ? memory.created_at
      : null;
  if (!createdAt) return null;
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return null;
  const diffMs = now - parsed;
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : 0;
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((tag) => tag.length > 0)
    .slice(0, 6);
}

function normalizeIntensity(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function buildContinuityRef(memory: MemoryLike | null, similarity: number | null, diasDesde: number | null) {
  if (!memory || typeof memory !== "object") return null;
  const id =
    typeof memory.id === "string" && memory.id.trim().length
      ? memory.id
      : typeof memory.memoria_id === "string" && memory.memoria_id.trim().length
      ? memory.memoria_id
      : null;

  return {
    id,
    memoria_id: id,
    resumo_eco:
      typeof memory.resumo_eco === "string" && memory.resumo_eco.trim().length
        ? memory.resumo_eco
        : null,
    emocao_principal:
      typeof memory.emocao_principal === "string" && memory.emocao_principal.trim().length
        ? memory.emocao_principal
        : null,
    intensidade: normalizeIntensity(memory.intensidade),
    created_at:
      typeof memory.created_at === "string" && memory.created_at.trim().length
        ? memory.created_at
        : null,
    tags: sanitizeTags(memory.tags),
    similarity,
    dias_desde: diasDesde,
  };
}

export function decideContinuity(
  mems: MemoryLike[] | null | undefined,
  options: ResolveContinuityOptions = {}
): ContinuityDecision {
  const threshold = options.threshold ?? 0.75;
  const recencyLimit = options.recencyDays ?? 30;
  const now = options.now ?? Date.now();

  if (!Array.isArray(mems) || mems.length === 0) {
    return { hasContinuity: false, similarity: null, diasDesde: null, memoryRef: null };
  }

  const top = mems[0] ?? null;
  const similarity = resolveSimilarity(top);
  const diasDesde = resolveDiasDesde(top, now);
  const ok =
    similarity != null &&
    similarity >= threshold &&
    (diasDesde == null ? false : diasDesde <= recencyLimit);

  const continuityRef = buildContinuityRef(top, similarity, diasDesde);

  return {
    hasContinuity: ok,
    similarity,
    diasDesde,
    memoryRef: ok ? continuityRef : null,
  };
}
