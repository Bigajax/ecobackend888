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

export function planBudget({
  ordered,
  candidates,
  budgetTokens = computeBudgetTokens(),
}: {
  ordered: string[];
  candidates: ModuleCandidate[];
  budgetTokens?: number;
}): BudgetPlan {
  const tokenMap = Object.fromEntries(
    candidates.map((candidate) => [candidate.name, candidate.tokens])
  );

  const result = Budgeter.run({
    ordered,
    tokenOf: (name: string) => tokenMap[name] ?? 0,
    budgetTokens,
    sepTokens: 1,
    safetyMarginTokens: 0,
  });

  return { ...result, budgetTokens };
}
