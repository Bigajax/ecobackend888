export type CandidatoModulo = {
  id: string;
  tokens: number;
  priorPeso: number;
  vptMean: number;
  vptCI?: number;
};

function sanitizeCandidates(candidatos: CandidatoModulo[]): CandidatoModulo[] {
  return candidatos
    .filter((c) => c && typeof c.id === "string" && c.id.trim().length > 0)
    .map((c) => ({
      id: c.id.trim(),
      tokens:
        typeof c.tokens === "number" && Number.isFinite(c.tokens) && c.tokens > 0
          ? Math.floor(c.tokens)
          : 0,
      priorPeso:
        typeof c.priorPeso === "number" && Number.isFinite(c.priorPeso) && c.priorPeso >= 0
          ? c.priorPeso
          : 0,
      vptMean:
        typeof c.vptMean === "number" && Number.isFinite(c.vptMean)
          ? c.vptMean
          : 0,
      vptCI:
        typeof c.vptCI === "number" && Number.isFinite(c.vptCI)
          ? c.vptCI
          : undefined,
    }))
    .filter((c) => c.tokens > 0);
}

function adjustedScore(candidate: CandidatoModulo): number {
  const base = candidate.vptMean;
  const peso = Math.max(1, candidate.priorPeso);
  return base / peso;
}

function roundGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(4));
}

export function solveKnapsack(
  budgetTokens: number,
  candidatos: CandidatoModulo[]
): { adotados: string[]; marginalGain: number } {
  const budget = Math.max(0, Math.floor(Number.isFinite(budgetTokens) ? budgetTokens : 0));
  if (budget === 0) {
    return { adotados: [], marginalGain: 0 };
  }

  const pool = sanitizeCandidates(candidatos);
  if (pool.length === 0) {
    return { adotados: [], marginalGain: 0 };
  }

  const sorted = pool.sort((a, b) => {
    const scoreDiff = adjustedScore(b) - adjustedScore(a);
    if (Math.abs(scoreDiff) > 1e-6) return scoreDiff > 0 ? 1 : -1;
    if (a.tokens !== b.tokens) return a.tokens - b.tokens;
    if (b.vptMean !== a.vptMean) return b.vptMean - a.vptMean;
    return a.id.localeCompare(b.id);
  });

  const adotados: string[] = [];
  let restante = budget;
  let gain = 0;

  for (const candidato of sorted) {
    if (candidato.tokens > restante) {
      continue;
    }
    adotados.push(candidato.id);
    restante -= candidato.tokens;
    gain += candidato.vptMean * candidato.tokens;
    if (restante <= 0) break;
  }

  return { adotados, marginalGain: roundGain(gain) };
}
