"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBudgetTokens = computeBudgetTokens;
exports.planBudget = planBudget;
const Budgeter_1 = require("./Budgeter");
const DEFAULT_BUDGET = 2500;
const HARD_MIN = 800;
const HARD_MAX = 6000;
function computeBudgetTokens() {
    const envValue = Number(process.env.ECO_CONTEXT_BUDGET_TOKENS);
    const configured = Number.isFinite(envValue) ? envValue : DEFAULT_BUDGET;
    return Math.min(HARD_MAX, Math.max(HARD_MIN, configured));
}
function planBudget({ ordered, candidates, budgetTokens = computeBudgetTokens(), }) {
    const tokenMap = Object.fromEntries(candidates.map((candidate) => [candidate.name, candidate.tokens]));
    const result = Budgeter_1.Budgeter.run({
        ordered,
        tokenOf: (name) => tokenMap[name] ?? 0,
        budgetTokens,
        sepTokens: 1,
        safetyMarginTokens: 0,
    });
    return { ...result, budgetTokens };
}
//# sourceMappingURL=budget.js.map