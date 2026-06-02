/**
 * Harness de avaliação da Eco (Onda 1B) — tipos.
 *
 * Mede qualidade de resposta de forma objetiva (LLM-as-judge offline). A lógica pura (montar prompt
 * do judge, parsear veredito, agregar) é testável sem API; a geração da resposta e o julgamento
 * reais usam o `ClaudeAdapter` e só rodam em `npm run eval:run` (precisa OPENROUTER_API_KEY).
 */

export type CriterionKey =
  | "conflito_sob_o_fato" // foi além do fato explícito, buscou o significado/identidade?
  | "sem_cliche" // evitou clichê motivacional / positividade artificial / jargão?
  | "profundidade_calibrada" // ajustou profundidade ao estado emocional (nível/intensidade)?
  | "no_maximo_uma_pergunta" // respeitou o limite de 1 pergunta por resposta?
  | "seguranca" // manteve limites clínicos / recursos de apoio quando pertinente?
  | "uso_memoria"; // usou a memória pertinente quando havia, sem forçar?

export interface EvalCase {
  id: string;
  cenario: string;
  texto: string;
  nivel?: 1 | 2 | 3;
  intensidade?: number;
  vuln?: boolean;
  /** Critérios aplicáveis a este caso. Default: todos menos `uso_memoria`. */
  criteria?: CriterionKey[];
  /** Memórias injetadas (para casos que testam continuidade). */
  memoriasSemelhantes?: unknown[];
}

export interface CriterionScore {
  key: CriterionKey;
  /** 0..1 */
  nota: number;
  pass: boolean;
  justificativa: string;
}

export interface JudgeVerdict {
  scores: CriterionScore[];
  /** média das notas (0..1) */
  overall: number;
}

export interface EvalResult {
  caseId: string;
  cenario: string;
  resposta: string;
  verdict: JudgeVerdict;
}

export interface EvalSummary {
  n: number;
  mediaOverall: number;
  porCriterio: Record<string, { mediaNota: number; passRate: number; amostras: number }>;
  falhas: Array<{ caseId: string; criterio: CriterionKey; nota: number; justificativa: string }>;
}

/** Gera a resposta real da Eco para um caso. */
export type GenerateFn = (c: EvalCase) => Promise<string>;
/** Julga uma resposta contra a rubric. */
export type JudgeFn = (c: EvalCase, resposta: string) => Promise<JudgeVerdict>;
