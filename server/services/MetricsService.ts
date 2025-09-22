type PerformanceMetrics = {
  tempoTotal: number;
  tempoEmbedding: number;
  tempoContexto: number;
  tempoEco: number;
  tempoBlocoTecnico: number;
  cacheHits: number;
  tokensUsados: number;
};

const metricas: PerformanceMetrics[] = [];

export function logMetricas(m: PerformanceMetrics) {
  metricas.push(m);
  if (metricas.length % 10 === 0) {
    const soma = metricas.slice(-10).reduce(
      (acc, x) => ({
        tempoTotal: acc.tempoTotal + x.tempoTotal,
        tempoEco: acc.tempoEco + x.tempoEco,
        cacheHits: acc.cacheHits + x.cacheHits,
        tokensUsados: acc.tokensUsados + x.tokensUsados,
      }),
      { tempoTotal: 0, tempoEco: 0, cacheHits: 0, tokensUsados: 0 }
    );
    const tempoMedio = Math.round(soma.tempoTotal / 10);
    const ecoMedio   = Math.round(soma.tempoEco   / 10); // corrigido
    const cacheHitRate = Math.round((soma.cacheHits / 10) * 100) + "%";
    const tokensMedio  = Math.round(soma.tokensUsados / 10);
    console.log("📊 Métricas (últimas 10):", { tempoMedio, ecoMedio, cacheHitRate, tokensMedio });
  }
}
