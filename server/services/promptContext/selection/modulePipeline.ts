import type { EcoDecisionResult } from "../../conversation/ecoDecisionHub";
import type { DecSnapshot } from "../Selector";
import type { DecisionSignalMap } from "../pipeline/signalsBuilder";
import type { BiasSnapshotResult } from "../pipeline/biasesResolver";
import type { HeuristicsRuntime } from "../heuristicsV2";
import { ModuleCatalog } from "../moduleCatalog";
import { selectModules, type ModuleSelectionResult } from "./moduleSelector";
import { runKnapsack, type KnapsackCandidate, type KnapsackOutput } from "./knapsackOptimizer";
import { planAndStitch, type BudgetPlannerResult } from "./budgetPlanner";
import { applyContinuityTextToModule } from "../pipeline/continuityResolver";

interface ActivationTracer {
  addModule(id: string, reason: string | null, mode: "selected" | "skipped"): void;
}

export interface ModulePipelineParams {
  texto: string;
  ecoDecision: EcoDecisionResult;
  decSnapshot: DecSnapshot;
  decisionSignals: DecisionSignalMap;
  heuristicsRuntime: HeuristicsRuntime | null;
  biasSnapshots: BiasSnapshotResult;
  hasContinuity: boolean;
  continuityRef: unknown;
  nivel: 1 | 2 | 3;
  activationTracer?: ActivationTracer | null;
}

export interface ModulePipelineResult {
  selectionResult: ModuleSelectionResult;
  knapsackResult: KnapsackOutput;
  budgetResult: BudgetPlannerResult;
  adjustedRegular: ModuleSelectionResult["regularModules"];
  adjustedFooters: ModuleSelectionResult["footerModules"];
  stitched: string;
}

export async function executeModulePipeline({
  texto,
  ecoDecision,
  decSnapshot,
  decisionSignals,
  heuristicsRuntime,
  biasSnapshots,
  hasContinuity,
  continuityRef,
  nivel,
  activationTracer: maybeTracer,
}: ModulePipelineParams): Promise<ModulePipelineResult> {
  const tracer: ActivationTracer | undefined = maybeTracer || undefined;
  const selectionResult = await selectModules({
    texto,
    ecoDecision,
    decSnapshot,
    decisionSignals,
    heuristicsRuntime,
    biasSnapshots,
  });

  const adjustedRegular = selectionResult.regularModules.map((module) =>
    applyContinuityTextToModule(module, hasContinuity, continuityRef)
  );
  const adjustedFooters = selectionResult.footerModules.map((module) =>
    applyContinuityTextToModule(module, hasContinuity, continuityRef)
  );

  const modulesWithTokens = [...adjustedRegular, ...adjustedFooters].map((module) => {
    const moduleWithBytes = module as typeof module & { bytes?: number };
    const base: KnapsackCandidate = {
      name: module.name,
      text: module.text,
      tokens: ModuleCatalog.tokenCountOf(module.name, module.text),
      meta: module.meta,
      hadContent: Boolean(module.text && module.text.length > 0),
    };
    if (typeof moduleWithBytes.bytes === "number") {
      return { ...base, bytes: moduleWithBytes.bytes };
    }
    return base;
  });

  const knapsackInput = {
    regularModules: adjustedRegular,
    footerModules: adjustedFooters,
    modulesWithTokens,
    debugMap: selectionResult.debugMap,
    pinnedSet: selectionResult.pinnedSet,
    ordered: selectionResult.ordered,
    selectionOrderedNames: selectionResult.selection.orderedNames,
  };
  const knapsackResult = runKnapsack(knapsackInput);

  const budgetResult = planAndStitch({
    orderedAllowed: knapsackResult.orderedAllowed,
    filteredModulesWithTokens: knapsackResult.filteredModulesWithTokens,
    pinned: Array.from(selectionResult.pinnedSet),
    debugMap: knapsackResult.debugMap,
    tokenLookup: knapsackResult.tokenLookup,
    adoptedSet: knapsackResult.adoptedSet,
    knapsackBudget: knapsackResult.knapsackBudget,
    knapsackResult: knapsackResult.knapsackResult,
    regularModules: adjustedRegular,
    footerModules: adjustedFooters,
    nivel,
    ecoDecision,
    activationTracer: tracer,
  });

  return {
    selectionResult,
    knapsackResult,
    budgetResult,
    adjustedRegular,
    adjustedFooters,
    stitched: budgetResult.stitched,
  };
}
