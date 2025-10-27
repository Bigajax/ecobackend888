import type { ActiveBiasSnapshot } from "../../conversation/ecoDecisionHub";
import type { HeuristicaFlagRecord } from "../heuristicaFlags";
import type { HeuristicsRuntime } from "../heuristicsV2";
import { heuristicaFlagToSignal } from "./signalsBuilder";
import type { DecisionSignalMap } from "./signalsBuilder";

export interface BiasSnapshotResult {
  active: ActiveBiasSnapshot[];
  decayedMap: Record<string, ActiveBiasSnapshot>;
  all: ActiveBiasSnapshot[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Number(value.toFixed(3));
}

export function resolveBiasSnapshots(
  runtime: HeuristicsRuntime | null,
  decisionSignals: DecisionSignalMap,
  heuristicaFlags: HeuristicaFlagRecord,
  defaultMin: number
): BiasSnapshotResult {
  const allEntries: ActiveBiasSnapshot[] = [];
  const activeMap = new Map<string, ActiveBiasSnapshot>();
  const decayedMap: Record<string, ActiveBiasSnapshot> = {};
  const nowIso = new Date().toISOString();

  if (runtime) {
    const details = runtime.details ?? {};
    for (const [signal, detail] of Object.entries(details)) {
      if (!signal.startsWith("bias:")) continue;
      const effective = clamp01(detail?.effectiveScore ?? 0);
      const entry: ActiveBiasSnapshot = {
        bias: signal,
        confidence: effective,
        decayApplied:
          Number(detail?.decayedScore ?? 0) > Number(detail?.currentScore ?? 0) + 1e-3,
        source: detail?.source ?? "pattern",
        lastSeenAt: detail?.lastSeenAt ?? null,
      };
      activeMap.set(signal, entry);
      allEntries.push(entry);

      const passes =
        effective >= defaultMin && !(detail?.suppressedByCooldown ?? false);
      const decayedPasses =
        clamp01(detail?.decayedScore ?? 0) >= defaultMin &&
        !(detail?.suppressedByCooldown ?? false);
      if (passes || decayedPasses) {
        decayedMap[signal] = entry;
      }
    }
  }

  const fallbackBiases = new Set<string>();
  for (const [flag, signal] of Object.entries(heuristicaFlagToSignal)) {
    if ((heuristicaFlags as Record<string, boolean | undefined>)[flag]) {
      fallbackBiases.add(signal);
    }
  }
  for (const [signal, value] of Object.entries(decisionSignals)) {
    if (signal.startsWith("bias:") && value) {
      fallbackBiases.add(signal);
    }
  }

  for (const signal of fallbackBiases) {
    if (activeMap.has(signal)) {
      if (!decayedMap[signal]) {
        decayedMap[signal] = activeMap.get(signal)!;
      }
      continue;
    }
    const entry: ActiveBiasSnapshot = {
      bias: signal,
      confidence: 0.6,
      decayApplied: false,
      source: "legacy",
      lastSeenAt: nowIso,
    };
    activeMap.set(signal, entry);
    allEntries.push(entry);
    decayedMap[signal] = entry;
  }

  const activeEntries = Array.from(new Set(Object.values(decayedMap)));
  const sorter = (a: ActiveBiasSnapshot, b: ActiveBiasSnapshot) =>
    b.confidence - a.confidence || a.bias.localeCompare(b.bias);
  activeEntries.sort(sorter);
  allEntries.sort(sorter);

  return { active: activeEntries, decayedMap, all: allEntries };
}
