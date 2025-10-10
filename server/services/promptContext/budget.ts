import { Budgeter } from "./Budgeter";
import type { ModuleCandidate } from "./moduleCatalog";

const DEFAULT_BUDGET = 2500;
const HARD_MIN = 800;
const HARD_MAX = 6000;

export type BudgetPlan = ReturnType<typeof Budgeter.run> & {
  budgetTokens: number;
};

export function computeBudgetTokens(): number {
  const envValue = Number(process.env.ECO_CONTEXT_BUDGET_TOKENS);
  const configured = Number.isFinite(envValue) ? envValue : DEFAULT_BUDGET;
  return Math.min(HARD_MAX, Math.max(HARD_MIN, configured));
}

type PlanBudgetInput = {
  ordered: string[];
  candidates: ModuleCandidate[];
  budgetTokens?: number;
  /** Tokens por separador entre módulos (default: 1) */
  sepTokens?: number;
  /** Margem de segurança para evitar estouro (default: 0) */
  safetyMarginTokens?: number;
  /**
   * Módulos fixos que devem ser considerados primeiro.
   * Ex.: ["DEVELOPER_PROMPT.txt"]
   */
  pinned?: string[];
  /**
   * Pesos absolutos de ordenação: menor = maior prioridade.
   * Ex.: { "DEVELOPER_PROMPT.txt": 0, "PRINCIPIOS_CHAVE.txt": 3 }
   */
  orderWeights?: Record<string, number>;
};

export function planBudget({
  ordered,
  candidates,
  budgetTokens = computeBudgetTokens(),
  sepTokens = 1,
  safetyMarginTokens = 0,
  pinned = [],
  orderWeights,
}: PlanBudgetInput): BudgetPlan {
  const tokenMap = Object.fromEntries(
    candidates.map((candidate) => [candidate.name, candidate.tokens])
  );

  const result = Budgeter.run({
    ordered,
    tokenOf: (name: string) => tokenMap[name] ?? 0,
    budgetTokens,
    sepTokens,
    safetyMarginTokens,
    pinned,
    orderWeights,
  });

  return { ...result, budgetTokens };
}
