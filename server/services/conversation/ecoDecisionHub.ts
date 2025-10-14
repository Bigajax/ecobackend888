import { estimarIntensidade0a10, derivarFlags, type Flags, type ModuleDebugEntry } from "../promptContext/Selector";
import type { HeuristicaFlagRecord } from "../promptContext/heuristicaFlags";

export type EcoVivaStep = "V" | "I" | "A" | "Pausa";

export interface EcoDecisionOptions {
  heuristicaFlags?: HeuristicaFlagRecord;
}

export interface EcoDecisionDebug {
  intensitySignals: string[];
  vulnerabilitySignals: string[];
  modules: ModuleDebugEntry[];
  selectedModules: string[];
}

export interface EcoDecisionResult {
  intensity: number;
  openness: 1 | 2 | 3;
  isVulnerable: boolean;
  vivaSteps: EcoVivaStep[];
  saveMemory: boolean;
  hasTechBlock: boolean;
  tags: string[];
  domain: string | null;
  flags: Flags;
  debug: EcoDecisionDebug;
}

export const MEMORY_THRESHOLD = 7;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const vulnerabilityRegexes: RegExp[] = [
  /me (?:sinto|senti) vulner[aá]vel/i,
  /abrir meu? cora[cç][aã]o/i,
  /dif[ií]cil de falar/i,
  /vergonha/i,
  /medo de julgamento/i,
  /expost[oa]/i,
  /me mostrar como sou/i,
  /mostrar fraqueza/i,
  /medo de parecer fraco/i,
  /me abrir/i,
];

function detectVulnerability(text: string, flags: Flags): { isVulnerable: boolean; signals: string[] } {
  const signals: string[] = [];
  const normalized = text || "";

  if (flags.vulnerabilidade || flags.vulnerability) {
    signals.push("flag:vulnerability");
  }
  if (flags.vergonha || flags.shame) {
    signals.push("flag:shame");
  }
  if (flags.culpa_marcada || flags.guilt) {
    signals.push("flag:guilt");
  }
  if (flags.autocritica || flags.self_criticism) {
    signals.push("flag:self_criticism");
  }

  for (const regex of vulnerabilityRegexes) {
    if (regex.test(normalized)) {
      signals.push(`lexical:${regex.source}`);
      break;
    }
  }

  const isVulnerable = signals.length > 0;
  return { isVulnerable, signals };
}

function deriveOpenness(intensity: number, isVulnerable: boolean): 1 | 2 | 3 {
  if (intensity >= 7 && isVulnerable) return 3;
  if (intensity >= 5) return 2;
  return 1;
}

function deriveVivaSteps(openness: 1 | 2 | 3): EcoVivaStep[] {
  switch (openness) {
    case 3:
      return ["V", "I", "V", "A", "Pausa"];
    case 2:
      return ["V", "I", "A"];
    default:
      return ["V", "A"];
  }
}

export function computeEcoDecision(texto: string, options: EcoDecisionOptions = {}): EcoDecisionResult {
  const intensityRaw = estimarIntensidade0a10(texto);
  const intensity = clamp(Number.isFinite(intensityRaw) ? intensityRaw : 0, 0, 10);
  const heuristicaFlags = options.heuristicaFlags ?? {};
  const flags = derivarFlags(texto, heuristicaFlags);

  const { isVulnerable, signals: vulnerabilitySignals } = detectVulnerability(texto, flags);
  const openness = deriveOpenness(intensity, isVulnerable);
  const vivaSteps = deriveVivaSteps(openness);
  const saveMemory = intensity >= MEMORY_THRESHOLD;

  return {
    intensity,
    openness,
    isVulnerable,
    vivaSteps,
    saveMemory,
    hasTechBlock: saveMemory,
    tags: [],
    domain: null,
    flags,
    debug: {
      intensitySignals: [`heuristic:${intensityRaw}`],
      vulnerabilitySignals,
      modules: [],
      selectedModules: [],
    },
  };
}
