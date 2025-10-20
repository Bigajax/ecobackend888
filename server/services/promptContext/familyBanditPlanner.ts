import { log } from "./logger";
import type { Flags } from "./Selector";
import {
  getManifestDefaults,
  getManifestFamily,
  getManifestModule,
  listManifestModulesByFamily,
  manifestHasData,
} from "./moduleManifest";
import { qualityAnalyticsStore } from "../analytics/analyticsStore";

function sampleStandardNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export interface FamilyContextSnapshot {
  openness: number;
  intensity: number;
  isVulnerable: boolean;
  flags: Flags;
  signals?: Record<string, boolean>;
}

export interface FamilyDecisionLog {
  familyId: string;
  rewardKey: string | null;
  baseline: string | null;
  chosen: string | null;
  chosenBy: "ts" | "baseline" | "shadow";
  tsPick: string | null;
  eligibleArms: Array<{
    id: string;
    tokensAvg: number;
    alpha: number;
    beta: number;
    count: number;
    gatePassed: boolean;
  }>;
  tokensPlanned: number;
  coldStartApplied: boolean;
}

export interface FamilyPlannerResult {
  modules: string[];
  decisions: FamilyDecisionLog[];
  excluded: string[];
  dependencies: string[];
}

function gatePasses(
  context: FamilyContextSnapshot,
  signal: string | undefined,
  minOpen: number | undefined
): boolean {
  if (minOpen != null && context.openness < minOpen) {
    return false;
  }
  if (!signal) return true;
  if (signal.startsWith("bias:")) {
    return Boolean(context.signals?.[signal]);
  }
  switch (signal) {
    case "open":
      return context.openness >= (minOpen ?? 1);
    case "vulnerability":
      return Boolean(
        context.isVulnerable ||
          context.flags?.vulnerabilidade ||
          context.flags?.vulnerability
      );
    case "memoria":
      return Boolean(context.flags?.useMemories);
    case "pattern":
      return Boolean(context.flags?.patternSynthesis);
    case "intensity:alta":
      return Boolean(context.signals?.["intensity:alta"]);
    case "memoria:alta":
      return Boolean(context.signals?.["memoria:alta"]);
    case "presenca_racional":
      return Boolean(context.signals?.presenca_racional);
    default:
      log.warn("[FamilyBandit] unknown_gate_signal", { signal });
      return true;
  }
}

function resolveFeatureFlags(): {
  shadow: boolean;
  early: boolean;
  pilotPercent: number;
} {
  const shadow = process.env.ECO_BANDIT_SHADOW !== "0";
  const early = process.env.ECO_BANDIT_EARLY === "1";
  const rawPercent = Number.parseInt(process.env.ECO_BANDIT_PILOT_PERCENT ?? "10", 10);
  const pilotPercent = Number.isFinite(rawPercent) ? Math.min(Math.max(rawPercent, 0), 100) : 10;
  return { shadow, early, pilotPercent };
}

export function planFamilyModules(
  orderedBase: string[],
  extras: string[],
  context: FamilyContextSnapshot
): FamilyPlannerResult {
  if (!manifestHasData()) {
    const merged = Array.from(new Set([...orderedBase, ...extras]));
    return { modules: merged, decisions: [], excluded: [], dependencies: [] };
  }

  const featureFlags = resolveFeatureFlags();
  const roll = Math.random() * 100;
  const applyTs = !featureFlags.shadow && (!featureFlags.early || roll < featureFlags.pilotPercent);
  const chosenByGlobal: "ts" | "baseline" | "shadow" = featureFlags.shadow
    ? "shadow"
    : applyTs
    ? "ts"
    : "baseline";

  const uniqueOrder = Array.from(new Set([...orderedBase, ...extras]));
  const seenFamilies = new Set<string>();
  const finalModules: string[] = [];
  const excludedModules = new Set<string>();
  const dependencySet = new Set<string>();
  const decisions: FamilyDecisionLog[] = [];

  const defaults = getManifestDefaults();
  const coldStartBoost = qualityAnalyticsStore.getBanditColdStartBoost();

  for (const candidate of uniqueOrder) {
    const manifestEntry = getManifestModule(candidate);
    if (!manifestEntry) {
      if (!excludedModules.has(candidate)) {
        finalModules.push(candidate);
      }
      continue;
    }

    const familyId = manifestEntry.family;
    if (seenFamilies.has(familyId)) {
      continue;
    }
    seenFamilies.add(familyId);

    const family = getManifestFamily(familyId);
    const familyModules = listManifestModulesByFamily(familyId).filter((arm) => arm.enabled !== false);

    const eligible: FamilyDecisionLog["eligibleArms"] = [];
    let tsPick: { id: string; score: number; alpha: number; beta: number; count: number; tokens: number; cold: boolean } | null = null;

    for (const arm of familyModules) {
      const passes = gatePasses(context, arm.gate?.signal, arm.gate?.min_open);
      const posterior = qualityAnalyticsStore.getBanditPosterior(familyId, arm.id);
      const variance =
        (posterior.alpha * posterior.beta) /
        Math.max(1e-6, (posterior.alpha + posterior.beta) ** 2 * (posterior.alpha + posterior.beta + 1));
      const stddev = Math.sqrt(Math.max(variance, 1e-6));
      let draw = posterior.alpha / Math.max(posterior.alpha + posterior.beta, 1e-6);
      draw += stddev * sampleStandardNormal();
      let coldApplied = false;
      if (posterior.count < 20) {
        draw += coldStartBoost;
        coldApplied = true;
      }
      draw = Math.min(Math.max(draw, 0), 1);
      eligible.push({
        id: arm.id,
        tokensAvg: arm.tokens_avg,
        alpha: posterior.alpha,
        beta: posterior.beta,
        count: posterior.count,
        gatePassed: passes,
      });
      if (!passes) continue;
      if (!tsPick || draw > tsPick.score) {
        tsPick = {
          id: arm.id,
          score: draw,
          alpha: posterior.alpha,
          beta: posterior.beta,
          count: posterior.count,
          tokens: arm.tokens_avg,
          cold: coldApplied,
        };
      }
    }

    const baselineId = family?.baseline ?? familyModules.find((arm) => arm.id === candidate)?.id ?? null;
    const selectedArm = applyTs && tsPick ? tsPick.id : baselineId ?? tsPick?.id ?? manifestEntry.id;
    const chosenModule = selectedArm ?? manifestEntry.id;

    if (familyModules.every((arm) => arm.enabled === false)) {
      log.warn("[FamilyBandit] family_disabled", { familyId });
    }

    const tokensPlanned = (familyModules.find((arm) => arm.id === chosenModule)?.tokens_avg ?? manifestEntry.tokens_avg) || defaults.maxAuxTokens;

    decisions.push({
      familyId,
      rewardKey: family?.reward_key ?? manifestEntry.reward_key ?? null,
      baseline: baselineId,
      chosen: chosenModule,
      chosenBy: chosenByGlobal,
      tsPick: tsPick ? tsPick.id : null,
      eligibleArms: eligible,
      tokensPlanned,
      coldStartApplied: Boolean(tsPick?.cold && applyTs),
    });

    if (chosenModule) {
      if (!excludedModules.has(chosenModule)) {
        finalModules.push(chosenModule);
      }
      const chosenEntry = familyModules.find((arm) => arm.id === chosenModule) ?? manifestEntry;
      const excludes = chosenEntry.excludes ?? [];
      for (const item of excludes) {
        excludedModules.add(item);
      }
      const dependsOn = chosenEntry.depends_on ?? [];
      for (const dep of dependsOn) {
        dependencySet.add(dep);
      }
    }
  }

  for (const dep of dependencySet) {
    if (!finalModules.includes(dep)) {
      finalModules.push(dep);
    }
  }

  const uniqueFinal = Array.from(new Set(finalModules.filter((mod) => !excludedModules.has(mod))));

  return {
    modules: uniqueFinal,
    decisions,
    excluded: Array.from(excludedModules),
    dependencies: Array.from(dependencySet),
  };
}

