import { planBudget } from "../budget";
import { applyReductions, stitchModules } from "../stitcher";
import { ordemAbsoluta } from "../matrizPromptBaseV2";
import type { ModuleDebugEntry, PreparedModule } from "../Selector";
import type { EcoDecisionResult } from "../../conversation/ecoDecisionHub";
import type { KnapsackCandidate } from "./knapsackOptimizer";
import { sortByAbsoluteOrder } from "./moduleSelector";

interface ActivationTracer {
  addModule(id: string, reason: string | null, mode: "selected" | "skipped"): void;
}

export interface BudgetPlannerParams {
  orderedAllowed: string[];
  filteredModulesWithTokens: KnapsackCandidate[];
  pinned: string[];
  debugMap: Map<string, ModuleDebugEntry>;
  tokenLookup: Map<string, number>;
  adoptedSet: Set<string>;
  knapsackBudget: number;
  knapsackResult: { adotados: string[]; marginalGain: number };
  regularModules: PreparedModule[];
  footerModules: PreparedModule[];
  nivel: 1 | 2 | 3;
  ecoDecision: EcoDecisionResult;
  activationTracer?: ActivationTracer | null;
}

export interface BudgetPlannerResult {
  budgetResult: ReturnType<typeof planBudget>;
  finalRegular: PreparedModule[];
  finalFooters: PreparedModule[];
  reduced: Array<{ name: string; text: string }>;
  stitched: string;
  moduleDebugEntries: ModuleDebugEntry[];
  debugMap: Map<string, ModuleDebugEntry>;
  tokensAditivos: number;
}

export function planAndStitch({
  orderedAllowed,
  filteredModulesWithTokens,
  pinned,
  debugMap,
  tokenLookup,
  adoptedSet,
  knapsackBudget,
  knapsackResult,
  regularModules,
  footerModules,
  nivel,
  ecoDecision,
  activationTracer,
}: BudgetPlannerParams): BudgetPlannerResult {
  const budgetResult = planBudget({
    ordered: orderedAllowed,
    candidates: filteredModulesWithTokens,
    pinned,
    orderWeights: ordemAbsoluta,
  });

  const usedSet = new Set(budgetResult.used);

  const finalRegular = regularModules
    .filter((m) => usedSet.has(m.name))
    .sort((a, b) => sortByAbsoluteOrder(a.name, b.name));
  const finalFooters = footerModules
    .filter((m) => usedSet.has(m.name))
    .sort((a, b) => sortByAbsoluteOrder(a.name, b.name));

  const tokensAditivos = Array.from(adoptedSet).reduce((acc, id) => {
    const tokens = tokenLookup.get(id) ?? 0;
    return acc + tokens;
  }, 0);

  ecoDecision.debug.knapsack = {
    budget: knapsackBudget,
    adotados: Array.from(adoptedSet),
    marginalGain: knapsackResult.marginalGain,
    tokensAditivos,
  };
  (ecoDecision.debug as any).selectorStages = {
    ...(ecoDecision.debug as any).selectorStages,
    knapsack: {
      budget: knapsackBudget,
      adopted: Array.from(adoptedSet),
      marginalGain: knapsackResult.marginalGain,
      tokensAditivos,
    },
  };

  for (const module of [...regularModules, ...footerModules]) {
    if (usedSet.has(module.name)) continue;
    const existing = debugMap.get(module.name);
    if (existing) {
      existing.activated = false;
      existing.source = "budget";
      if (existing.reason && existing.reason !== "pass" && existing.reason !== "budget") {
        existing.reason = `${existing.reason}|budget`;
      } else {
        existing.reason = "budget";
      }
      debugMap.set(module.name, existing);
    } else {
      debugMap.set(module.name, {
        id: module.name,
        source: "budget",
        activated: false,
        reason: "budget",
        threshold: null,
      });
    }
  }

  const moduleDebugEntries = Array.from(debugMap.values());
  ecoDecision.debug.modules = moduleDebugEntries;
  ecoDecision.debug.selectedModules = budgetResult.used;
  (ecoDecision.debug as any).selectorStages = {
    ...(ecoDecision.debug as any).selectorStages,
    stitch: {
      final: budgetResult.used,
    },
  };

  if (activationTracer) {
    for (const entry of moduleDebugEntries) {
      const reasonParts: string[] = [];
      if (entry.reason) reasonParts.push(String(entry.reason));
      if (entry.source) reasonParts.push(`source:${entry.source}`);
      const reason = reasonParts.length ? reasonParts.join("|") : null;
      const mode = entry.activated ? "selected" : "skipped";
      activationTracer.addModule(entry.id, reason, mode);
    }
  }

  const reduced = applyReductions(
    finalRegular.map((module) => ({ name: module.name, text: module.text })),
    nivel
  );
  const stitched = stitchModules(reduced, nivel);

  return {
    budgetResult,
    finalRegular,
    finalFooters,
    reduced,
    stitched,
    moduleDebugEntries,
    debugMap,
    tokensAditivos,
  };
}
