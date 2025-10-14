import type { ModuleCandidate, ModuleFrontMatter } from "./moduleCatalog";
import type { Flags } from "./flags";
import type { ModuleDebugEntry } from "./baseSelection";

export type ModuleSelectionDebugEntry = ModuleDebugEntry;

export type DecSnapshot = {
  intensity: number;
  openness: 1 | 2 | 3;
  isVulnerable: boolean;
  vivaSteps: string[];
  saveMemory: boolean;
  hasTechBlock: boolean;
  tags: string[];
  domain: string | null;
  flags: Flags;
};

export type PreparedModule = {
  name: string;
  text: string;
  meta: ModuleFrontMatter;
};

interface ApplyModuleMetadataParams {
  dec: DecSnapshot;
  baseOrder: string[];
  candidates: ModuleCandidate[];
}

interface ApplyModuleMetadataResult {
  regular: PreparedModule[];
  footers: PreparedModule[];
  orderedNames: string[];
  debug: Map<string, ModuleSelectionDebugEntry>;
}

export function applyModuleMetadata({
  dec,
  baseOrder,
  candidates,
}: ApplyModuleMetadataParams): ApplyModuleMetadataResult {
  const indexByName = new Map<string, number>();
  baseOrder.forEach((name, idx) => indexByName.set(name, idx));

  const debug = new Map<string, ModuleSelectionDebugEntry>();
  const passing: CandidateWithOrder[] = [];

  for (const candidate of candidates) {
    const meta = candidate.meta ?? {};
    const { passes, reason, threshold } = evaluateFrontMatter(meta, dec);
    debug.set(candidate.name, {
      id: candidate.name,
      source: "front_matter",
      activated: passes,
      reason,
      threshold: threshold ?? null,
    });

    if (!passes) continue;

    const interpolated = interpolateDec(candidate.text, dec);
    const baseIndex = indexByName.get(candidate.name) ?? Number.MAX_SAFE_INTEGER;
    const orderValue = meta.order ?? baseIndex;

    passing.push({
      name: candidate.name,
      text: interpolated,
      meta,
      order: orderValue,
      baseIndex,
    });
  }

  passing.sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      a.baseIndex - b.baseIndex ||
      a.name.localeCompare(b.name)
  );

  const deduped: CandidateWithOrder[] = [];
  const dedupeKeys = new Map<string, string>();

  for (const candidate of passing) {
    const keyRaw = candidate.meta?.dedupeKey;
    if (!keyRaw) {
      deduped.push(candidate);
      continue;
    }

    const key = keyRaw.toLowerCase();
    if (dedupeKeys.has(key)) {
      const existing = debug.get(candidate.name);
      if (existing) {
        existing.activated = false;
        existing.source = "dedupe";
        existing.reason = `dedupe:${key}`;
        existing.threshold = null;
        debug.set(candidate.name, existing);
      } else {
        debug.set(candidate.name, {
          id: candidate.name,
          source: "dedupe",
          activated: false,
          reason: `dedupe:${key}`,
          threshold: null,
        });
      }
      continue;
    }

    dedupeKeys.set(key, candidate.name);
    deduped.push(candidate);
  }

  const regular: PreparedModule[] = [];
  const footers: PreparedModule[] = [];

  for (const candidate of deduped) {
    const inject = candidate.meta?.injectAs?.toLowerCase() ?? "";
    const prepared: PreparedModule = {
      name: candidate.name,
      text: candidate.text,
      meta: candidate.meta ?? {},
    };

    if (inject === "footer") {
      footers.push(prepared);
    } else {
      regular.push(prepared);
    }
  }

  const orderedNames = [...regular, ...footers].map((item) => item.name);

  return { regular, footers, orderedNames, debug };
}

type CandidateWithOrder = PreparedModule & { order: number; baseIndex: number };

function evaluateFrontMatter(
  meta: ModuleFrontMatter | undefined,
  dec: DecSnapshot
): { passes: boolean; reason: string; threshold: number | null } {
  if (!meta) return { passes: true, reason: "pass", threshold: null };

  const reasons: string[] = [];
  let threshold: number | null = null;

  if (typeof meta.minIntensity === "number" && dec.intensity < meta.minIntensity) {
    reasons.push(`minIntensity:${meta.minIntensity}`);
    threshold = meta.minIntensity;
  }

  if (typeof meta.maxIntensity === "number" && dec.intensity > meta.maxIntensity) {
    reasons.push(`maxIntensity:${meta.maxIntensity}`);
    threshold = meta.maxIntensity;
  }

  if (Array.isArray(meta.opennessIn) && meta.opennessIn.length > 0) {
    const allowed = meta.opennessIn.map((n) => Number(n));
    if (!allowed.includes(dec.openness)) {
      reasons.push(`opennessIn:${allowed.join("/")}`);
    }
  }

  if (meta.requireVulnerability && !dec.isVulnerable) {
    reasons.push("requireVulnerability");
  }

  if (Array.isArray(meta.flagsAny) && meta.flagsAny.length > 0) {
    const availableFlags = buildFlagMap(dec);
    const hasAny = meta.flagsAny.some((flag) => {
      const key = flag.trim();
      if (!key) return false;
      const normalized = key.toLowerCase();
      return Boolean(availableFlags[key] ?? availableFlags[normalized]);
    });

    if (!hasAny) {
      reasons.push(`flagsAny:${meta.flagsAny.join(",")}`);
    }
  }

  const passes = reasons.length === 0;
  return { passes, reason: passes ? "pass" : reasons.join("|"), threshold };
}

function buildFlagMap(dec: DecSnapshot): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const entries = Object.entries(dec.flags ?? {});
  for (const [key, value] of entries) {
    if (!key) continue;
    out[key] = Boolean(value);
    out[key.toLowerCase()] = Boolean(value);
  }

  const extras: Record<string, boolean> = {
    hasTechBlock: dec.hasTechBlock,
    hastechblock: dec.hasTechBlock,
    saveMemory: dec.saveMemory,
    savememory: dec.saveMemory,
    useMemories: Boolean((dec.flags as Record<string, unknown>)?.useMemories),
    usememories: Boolean((dec.flags as Record<string, unknown>)?.useMemories),
    patternSynthesis: Boolean((dec.flags as Record<string, unknown>)?.patternSynthesis),
    patternsynthesis: Boolean((dec.flags as Record<string, unknown>)?.patternSynthesis),
    isVulnerable: dec.isVulnerable,
    isvulnerable: dec.isVulnerable,
    vulnerable: dec.isVulnerable,
    vulneravel: dec.isVulnerable,
  };

  for (const [key, value] of Object.entries(extras)) {
    out[key] = value;
  }

  return out;
}

function interpolateDec(text: string, dec: DecSnapshot): string {
  if (!text) return "";

  return text.replace(/\{\{\s*DEC\.([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = (dec as Record<string, unknown>)[key];
    if (value == null) return "";
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item == null) return "";
          if (typeof item === "boolean") return item ? "true" : "false";
          return String(item);
        })
        .filter((item) => item.length > 0)
        .join(", ");
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  });
}
