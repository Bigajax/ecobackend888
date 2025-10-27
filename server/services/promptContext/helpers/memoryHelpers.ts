import type { SimilarMemory } from "../contextTypes";

export function collectTagsFromMemories(mems: SimilarMemory[] | undefined): string[] {
  if (!Array.isArray(mems)) return [];
  const counter = new Map<string, { label: string; count: number; order: number }>();
  let order = 0;
  for (const memory of mems) {
    const tags = Array.isArray(memory?.tags) ? memory.tags : [];
    for (const raw of tags) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const existing = counter.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counter.set(key, { label: trimmed, count: 1, order: order++ });
      }
    }
  }

  const sorted = Array.from(counter.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.order - b.order;
  });

  return sorted.slice(0, 4).map((entry) => entry.label);
}

export function deriveDominantDomain(mems: SimilarMemory[] | undefined): string | null {
  if (!Array.isArray(mems) || mems.length === 0) return null;
  const counter = new Map<string, { label: string; count: number; order: number }>();
  let order = 0;
  for (const memory of mems) {
    const rawDomain =
      typeof memory?.dominio_vida === "string"
        ? memory.dominio_vida
        : typeof (memory as any)?.dominio === "string"
        ? (memory as any).dominio
        : typeof (memory as any)?.domain === "string"
        ? (memory as any).domain
        : typeof (memory as any)?.dominioVida === "string"
        ? (memory as any).dominioVida
        : null;
    const trimmed = rawDomain?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const existing = counter.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counter.set(key, { label: trimmed, count: 1, order: order++ });
    }
  }

  const sorted = Array.from(counter.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.order - b.order;
  });

  return sorted.length ? sorted[0].label : null;
}

export function estimateMemoryTokens(mems: SimilarMemory[] | undefined): number {
  if (!Array.isArray(mems) || mems.length === 0) return 0;
  let chars = 0;
  for (const mem of mems) {
    const candidates = [mem?.resumo_eco, mem?.analise_resumo, mem?.texto, mem?.conteudo];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        chars += candidate.length;
        break;
      }
    }
  }
  return Math.round(chars / 4);
}
