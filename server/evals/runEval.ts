import type { EvalCase, EvalResult, GenerateFn, JudgeFn } from "./types";
import { defaultJudge } from "./judge";

export interface RunEvalsParams {
  cases: EvalCase[];
  generate: GenerateFn;
  judge?: JudgeFn;
  /** Limita o nº de casos (guardrail de custo). 0/undefined = todos. */
  limit?: number;
}

/** Orquestração pura: para cada caso, gera a resposta e julga. Injeção de generate/judge. */
export async function runEvals({
  cases,
  generate,
  judge = defaultJudge,
  limit,
}: RunEvalsParams): Promise<EvalResult[]> {
  const selected = limit && limit > 0 ? cases.slice(0, limit) : cases;
  const results: EvalResult[] = [];
  for (const c of selected) {
    const resposta = await generate(c);
    const verdict = await judge(c, resposta);
    results.push({ caseId: c.id, cenario: c.cenario, resposta, verdict });
  }
  return results;
}

/**
 * Gerador real: monta o prompt de produção (montarContextoEco) e chama o LLM. Só usado em
 * `eval:run` (precisa OPENROUTER_API_KEY). Importação dinâmica para o módulo carregar sem env.
 */
export async function defaultGenerate(c: EvalCase): Promise<string> {
  const [{ default: montarContextoEco }, { computeEcoDecision }, { claudeChatCompletion }] =
    await Promise.all([
      import("../services/promptContext/ContextBuilder"),
      import("../services/conversation/ecoDecisionHub"),
      import("../core/ClaudeAdapter"),
    ]);

  const decision = computeEcoDecision(c.texto);
  if (typeof c.intensidade === "number") decision.intensity = c.intensidade;
  if (c.vuln) decision.isVulnerable = true;
  if (c.nivel === 1 || c.nivel === 2 || c.nivel === 3) decision.openness = c.nivel;

  const ctx = await montarContextoEco({
    userId: "11111111-1111-4111-8111-111111111111",
    guestId: null,
    userName: "Rafael",
    texto: c.texto,
    mems: [],
    memoriasSemelhantes: c.memoriasSemelhantes ?? [],
    decision,
  } as any);

  const systemPrompt = ctx.montarMensagemAtual(c.texto);
  const res: any = await claudeChatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: c.texto },
    ],
    temperature: 0.5,
    maxTokens: 700,
  });
  return typeof res === "string" ? res : res?.content ?? "";
}
