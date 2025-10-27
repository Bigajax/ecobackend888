import type { EcoDecisionResult } from "../../conversation/ecoDecisionHub";
import type { DecSnapshot } from "../Selector";
import type { DecisionSignalMap } from "./signalsBuilder";
import type { BiasSnapshotResult } from "./biasesResolver";
import { resolveHeuristics } from "./heuristicsResolver";
import { buildDecisionSignals } from "./signalsBuilder";
import { resolveBiasSnapshots } from "./biasesResolver";
import type { HeuristicsRuntime } from "../heuristicsV2";
import type { HeuristicaFlagRecord } from "../heuristicaFlags";
import type { ContextMeta } from "../../../utils/types";
import type { SimilarMemory } from "../contextTypes";

export function buildDecSnapshot(
  ecoDecision: EcoDecisionResult,
  mergedTags: string[],
  resolvedDomain: string | null
): DecSnapshot {
  return {
    intensity: ecoDecision.intensity,
    openness: ecoDecision.openness,
    isVulnerable: ecoDecision.isVulnerable,
    vivaSteps: ecoDecision.vivaSteps,
    saveMemory: ecoDecision.saveMemory,
    hasTechBlock: ecoDecision.hasTechBlock,
    tags: mergedTags,
    domain: resolvedDomain,
    flags: ecoDecision.flags,
  };
}

export function updateDecisionDebug(
  ecoDecision: EcoDecisionResult,
  decisionSignals: DecisionSignalMap,
  biasSnapshots: BiasSnapshotResult
): void {
  const activeSignals = Object.keys(decisionSignals).sort();
  ecoDecision.signals = decisionSignals;
  ecoDecision.activeBiases = biasSnapshots.active;
  ecoDecision.decayedActiveBiases = Object.keys(biasSnapshots.decayedMap).sort();
  ecoDecision.debug = ecoDecision.debug ?? ({} as any);
  ecoDecision.debug.activeBiases = biasSnapshots.all;
  ecoDecision.debug.decayedActiveBiases = ecoDecision.decayedActiveBiases;
  (ecoDecision.debug as any).signals = activeSignals;
  (ecoDecision as any).debug = (ecoDecision as any).debug ?? { modules: [], selectedModules: [] };
}

interface DecisionContextParams {
  ecoDecision: EcoDecisionResult;
  heuristicaFlags: HeuristicaFlagRecord;
  normalizedTexto: string;
  identityKey: string;
  passiveSignalsParam: string[] | null;
  contextMetaBase: ContextMeta;
  memsSemelhantes: SimilarMemory[] | undefined;
}

export interface DecisionContextResult {
  heuristicsRuntime: HeuristicsRuntime | null;
  decisionSignals: DecisionSignalMap;
  biasSnapshots: BiasSnapshotResult;
}

export function resolveDecisionContext({
  ecoDecision,
  heuristicaFlags,
  normalizedTexto,
  identityKey,
  passiveSignalsParam,
  contextMetaBase,
  memsSemelhantes,
}: DecisionContextParams): DecisionContextResult {
  const heuristicsResolution = resolveHeuristics({
    heuristicaFlags,
    normalizedTexto,
    identityKey,
    passiveSignalsParam,
    contextMetaBase,
  });

  const heuristicsRuntimeActive: HeuristicsRuntime | null =
    heuristicsResolution.heuristicsEnabled && heuristicsResolution.heuristicsRuntime
      ? heuristicsResolution.heuristicsRuntime
      : null;

  const decisionSignals = buildDecisionSignals(
    {
      texto: normalizedTexto,
      heuristicaFlags,
      intensity: ecoDecision.intensity,
      memsSemelhantes,
    },
    heuristicsRuntimeActive
  );

  const biasSnapshots = resolveBiasSnapshots(
    heuristicsRuntimeActive,
    decisionSignals,
    heuristicaFlags,
    heuristicsResolution.heuristicsDefaultMin
  );

  updateDecisionDebug(ecoDecision, decisionSignals, biasSnapshots);

  return { heuristicsRuntime: heuristicsRuntimeActive, decisionSignals, biasSnapshots };
}
