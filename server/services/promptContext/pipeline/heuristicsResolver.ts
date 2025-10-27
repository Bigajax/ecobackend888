import { evaluateHeuristicSignals, type HeuristicsRuntime } from "../heuristicsV2";
import type { HeuristicaFlagRecord } from "../heuristicaFlags";
import type { ContextMeta } from "../../../utils/types";
import { parseEnvNumber } from "../helpers/validationHelpers";
import { heuristicaFlagToSignal } from "./signalsBuilder";

const HEURISTICS_HARD_OVERRIDE = 0.8;

export interface HeuristicsResolverParams {
  heuristicaFlags: HeuristicaFlagRecord;
  normalizedTexto: string;
  identityKey: string;
  passiveSignalsParam: string[] | null | undefined;
  contextMetaBase: ContextMeta;
}

export interface HeuristicsResolution {
  heuristicaFlagSignals: string[];
  heuristicsRuntime: HeuristicsRuntime | null;
  heuristicsDefaultMin: number;
  heuristicsEnabled: boolean;
  passiveSignalsNormalized: string[] | undefined;
}

export function resolveHeuristics({
  heuristicaFlags,
  normalizedTexto,
  identityKey,
  passiveSignalsParam,
  contextMetaBase,
}: HeuristicsResolverParams): HeuristicsResolution {
  const heuristicsEnabled = process.env.ECO_HEUR_V2 === "1";
  const heuristicsHalfLife = parseEnvNumber(
    process.env.ECO_HEUR_HALF_LIFE_MIN,
    20,
    { min: 1 }
  );
  const heuristicsCooldownTurns = parseEnvNumber(
    process.env.ECO_HEUR_COOLDOWN_TURNS,
    2,
    { min: 0, integer: true }
  );
  const heuristicsMaxArms = parseEnvNumber(
    process.env.ECO_HEUR_MAX_ARMS_PER_TURN,
    1,
    { min: 1, integer: true }
  );
  const heuristicsDefaultMin = parseEnvNumber(
    process.env.ECO_HEUR_MIN_SCORE_DEFAULT,
    0.3,
    { min: 0, max: 1 }
  );

  const heuristicaFlagSignals = heuristicsEnabled
    ? Array.from(
        new Set(
          Object.entries(heuristicaFlagToSignal)
            .filter(([flag]) =>
              Boolean(
                (heuristicaFlags as Record<string, boolean | undefined>)[
                  flag as keyof HeuristicaFlagRecord
                ]
              )
            )
            .map(([, signal]) => signal)
        )
      )
    : [];

  const passiveSignalsMerged: string[] = [];
  if (Array.isArray(passiveSignalsParam)) {
    passiveSignalsMerged.push(...passiveSignalsParam);
  }
  const metaPassiveRaw = (contextMetaBase as Record<string, unknown>)?.passiveSignals;
  if (Array.isArray(metaPassiveRaw)) {
    passiveSignalsMerged.push(...metaPassiveRaw);
  }
  const passiveSignalsNormalized = passiveSignalsMerged.length
    ? Array.from(
        new Set(
          passiveSignalsMerged
            .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
            .filter((item) => item.length > 0)
        )
      )
    : undefined;

  const heuristicsRuntime: HeuristicsRuntime | null = heuristicsEnabled
    ? evaluateHeuristicSignals({
        identityKey: identityKey || null,
        textCurrent: normalizedTexto,
        passiveSignals: passiveSignalsNormalized,
        flagSignals: heuristicaFlagSignals,
        halfLifeMinutes: heuristicsHalfLife,
        cooldownTurns: heuristicsCooldownTurns,
        defaultMin: heuristicsDefaultMin,
        maxArms: heuristicsMaxArms,
        hardOverride: HEURISTICS_HARD_OVERRIDE,
      }) ?? null
    : null;

  return {
    heuristicaFlagSignals,
    heuristicsRuntime,
    heuristicsDefaultMin,
    heuristicsEnabled,
    passiveSignalsNormalized,
  };
}
