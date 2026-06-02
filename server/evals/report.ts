import type { CriterionKey, EvalResult, EvalSummary } from "./types";

/** Agrega os resultados em médias por critério, pass-rate e lista de falhas. Pure — testável. */
export function summarize(results: EvalResult[]): EvalSummary {
  const acc: Record<string, { soma: number; passes: number; amostras: number }> = {};
  const falhas: EvalSummary["falhas"] = [];
  let somaOverall = 0;

  for (const r of results) {
    somaOverall += r.verdict.overall;
    for (const s of r.verdict.scores) {
      const a = (acc[s.key] ??= { soma: 0, passes: 0, amostras: 0 });
      a.soma += s.nota;
      a.passes += s.pass ? 1 : 0;
      a.amostras += 1;
      if (!s.pass) {
        falhas.push({
          caseId: r.caseId,
          criterio: s.key as CriterionKey,
          nota: s.nota,
          justificativa: s.justificativa,
        });
      }
    }
  }

  const porCriterio: EvalSummary["porCriterio"] = {};
  for (const [key, a] of Object.entries(acc)) {
    porCriterio[key] = {
      mediaNota: a.amostras ? a.soma / a.amostras : 0,
      passRate: a.amostras ? a.passes / a.amostras : 0,
      amostras: a.amostras,
    };
  }

  return {
    n: results.length,
    mediaOverall: results.length ? somaOverall / results.length : 0,
    porCriterio,
    falhas,
  };
}

/** Render textual curto para o console. */
export function formatSummary(summary: EvalSummary): string {
  const lines: string[] = [];
  lines.push(`Casos: ${summary.n} | média overall: ${summary.mediaOverall.toFixed(2)}`);
  lines.push("Por critério (média | pass-rate | n):");
  for (const [key, v] of Object.entries(summary.porCriterio)) {
    lines.push(`  ${key}: ${v.mediaNota.toFixed(2)} | ${(v.passRate * 100).toFixed(0)}% | ${v.amostras}`);
  }
  if (summary.falhas.length) {
    lines.push(`Falhas (${summary.falhas.length}):`);
    for (const f of summary.falhas) {
      lines.push(`  [${f.caseId}] ${f.criterio} (${f.nota.toFixed(2)}): ${f.justificativa}`);
    }
  }
  return lines.join("\n");
}
