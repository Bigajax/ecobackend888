import { solveKnapsack } from "../../orchestrator/knapsack";
import { getManifestDefaults } from "../moduleManifest";
import { ordemAbsoluta } from "../matrizPromptBaseV2";
import { qualityAnalyticsStore } from "../../analytics/analyticsStore";
import type { ModuleDebugEntry, PreparedModule } from "../Selector";
import type { ModuleCandidate } from "../moduleCatalog";
import { ensureDeveloperPromptFirst, sortByAbsoluteOrder } from "./moduleSelector";

const KNAPSACK_BUDGET_ENV = "ECO_KNAPSACK_BUDGET_TOKENS";
const VPT_FALLBACK = 0.0001;

export interface KnapsackCandidate extends ModuleCandidate {
  bytes?: number;
}

export interface KnapsackInput {
  regularModules: PreparedModule[];
  footerModules: PreparedModule[];
  modulesWithTokens: KnapsackCandidate[];
  debugMap: Map<string, ModuleDebugEntry>;
  pinnedSet: Set<string>;
  ordered: string[];
  selectionOrderedNames: string[];
}

export interface KnapsackOutput {
  knapsackBudget: number;
  adoptedSet: Set<string>;
  allowedSet: Set<string>;
  orderedAllowed: string[];
  filteredModulesWithTokens: KnapsackCandidate[];
  debugMap: Map<string, ModuleDebugEntry>;
  tokenLookup: Map<string, number>;
  knapsackResult: ReturnType<typeof solveKnapsack>;
}

function computeKnapsackBudget(): number {
  const envValueRaw = process.env[KNAPSACK_BUDGET_ENV];
  if (envValueRaw) {
    const parsed = Number.parseInt(envValueRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const defaults = getManifestDefaults();
  return defaults.maxAuxTokens;
}

function resolvePriorPeso(moduleName: string): number {
  const weight = ordemAbsoluta[moduleName];
  return Number.isFinite(weight as number) ? (weight as number) : 999;
}

function resolveVptMean(moduleName: string, tokens: number, priorPeso: number): number {
  const stats = qualityAnalyticsStore.getModuleVPT(moduleName);
  const mean = Number.isFinite(stats.vptMean) ? stats.vptMean : 0;
  if (mean > 0) return mean;
  const safeTokens = Math.max(1, tokens);
  return VPT_FALLBACK / Math.max(1, priorPeso) / safeTokens;
}

export function runKnapsack({
  regularModules,
  footerModules,
  modulesWithTokens,
  debugMap,
  pinnedSet,
  ordered,
  selectionOrderedNames,
}: KnapsackInput): KnapsackOutput {
  const tokenLookup = new Map<string, number>();
  for (const module of modulesWithTokens) {
    tokenLookup.set(module.name, module.tokens);
  }

  const knapsackBudget = computeKnapsackBudget();
  const knapsackCandidates = regularModules
    .filter((module) => !pinnedSet.has(module.name))
    .map((module) => {
      const tokens = tokenLookup.get(module.name) ?? 0;
      const priorPeso = resolvePriorPeso(module.name);
      const vptMean = resolveVptMean(module.name, tokens, priorPeso);
      return {
        id: module.name,
        tokens,
        priorPeso,
        vptMean,
      };
    })
    .filter((candidate) => candidate.tokens > 0);

  const knapsackResult = solveKnapsack(knapsackBudget, knapsackCandidates);
  const adoptedSet = new Set(knapsackResult.adotados);
  const allowedSet = new Set<string>([...pinnedSet, ...adoptedSet]);

  for (const module of regularModules) {
    if (allowedSet.has(module.name)) continue;
    const existing = debugMap.get(module.name);
    if (existing) {
      existing.activated = false;
      existing.source = "knapsack";
      existing.reason = existing.reason ? `${existing.reason}|knapsack` : "knapsack";
      debugMap.set(module.name, existing);
    } else {
      debugMap.set(module.name, {
        id: module.name,
        source: "knapsack",
        activated: false,
        reason: "knapsack",
        threshold: null,
      });
    }
  }

  const orderedAllowed = ensureDeveloperPromptFirst(
    Array.from(
      new Set([
        ...Array.from(pinnedSet),
        ...selectionOrderedNames.filter((name) => allowedSet.has(name)),
      ])
    ).sort(sortByAbsoluteOrder)
  );

  const filteredModulesWithTokens = modulesWithTokens.filter((module) =>
    allowedSet.has(module.name)
  );

  return {
    knapsackBudget,
    adoptedSet,
    allowedSet,
    orderedAllowed,
    filteredModulesWithTokens,
    debugMap,
    tokenLookup,
    knapsackResult,
  };
}
