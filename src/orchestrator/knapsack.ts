export type Candidato = {
  id: string;
  tokens: number;
  priorPeso: number;
  vptMean: number;
  vptCI?: [number, number];
};

export interface KnapsackResult {
  adotados: Candidato[];
  marginalGain: number;
  tokensAdotados: number;
}

export function solveKnapsack(budgetTokens: number, candidatos: Candidato[]): KnapsackResult {
  if (!Array.isArray(candidatos) || budgetTokens <= 0) {
    return { adotados: [], marginalGain: 0, tokensAdotados: 0 };
  }

  const sorted = [...candidatos].sort((a, b) => {
    const scoreA = a.vptMean * a.priorPeso;
    const scoreB = b.vptMean * b.priorPeso;
    if (scoreA === scoreB) {
      return (b.vptCI?.[0] ?? 0) - (a.vptCI?.[0] ?? 0);
    }

    return scoreB - scoreA;
  });

  const adotados: Candidato[] = [];
  let tokensRestantes = budgetTokens;
  let ganhoEstimado = 0;
  let tokensUsados = 0;

  for (const candidato of sorted) {
    if (candidato.tokens <= 0) {
      continue;
    }

    if (candidato.tokens > tokensRestantes) {
      continue;
    }

    adotados.push(candidato);
    tokensRestantes -= candidato.tokens;
    tokensUsados += candidato.tokens;
    ganhoEstimado += candidato.vptMean * candidato.priorPeso;
  }

  return { adotados, marginalGain: Number(ganhoEstimado.toFixed(4)), tokensAdotados: tokensUsados };
}
