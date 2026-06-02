/**
 * CLI do harness de avaliação — `npm run eval:run [-- --limit N]`.
 * Gera respostas reais (montarContextoEco + LLM) e julga (LLM-as-judge). Requer OPENROUTER_API_KEY.
 * Salva o relatório em server/evals/reports/<timestamp>.json e imprime o resumo.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { EVAL_CASES } from "./dataset";
import { runEvals, defaultGenerate } from "./runEval";
import { defaultJudge } from "./judge";
import { summarize, formatSummary } from "./report";

function parseLimit(argv: string[]): number | undefined {
  const i = argv.indexOf("--limit");
  if (i !== -1 && argv[i + 1]) {
    const n = Number(argv[i + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const env = Number(process.env.ECO_EVAL_LIMIT);
  return Number.isFinite(env) && env > 0 ? env : undefined;
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("[eval] OPENROUTER_API_KEY ausente — o eval:run precisa de chave para gerar/julgar.");
    process.exitCode = 1;
    return;
  }

  const limit = parseLimit(process.argv.slice(2));
  console.log(`[eval] rodando ${limit ?? EVAL_CASES.length} caso(s)...`);

  const results = await runEvals({
    cases: EVAL_CASES,
    generate: defaultGenerate,
    judge: defaultJudge,
    limit,
  });

  const summary = summarize(results);
  console.log("\n" + formatSummary(summary) + "\n");

  const reportsDir = path.join(__dirname, "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(reportsDir, `${stamp}.json`);
  await fs.writeFile(file, JSON.stringify({ summary, results }, null, 2), "utf8");
  console.log(`[eval] relatório salvo em ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error("[eval] erro:", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
