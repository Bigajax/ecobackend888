import { REFLEXO_PATTERNS, type ReflexoPattern } from "./reflexoPatterns";
import type { EcoHints } from "../utils/types";

export interface PlanHintsContext {
  recentUserInputs?: string[];
  lastHintKey?: string | null;
}

function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function baseScoreForPriority(priority: ReflexoPattern["priority"]): number {
  switch (priority) {
    case 1:
      return 0.78;
    case 2:
      return 0.7;
    default:
      return 0.62;
  }
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return Number(score.toFixed(3));
}

function countPatternMatches(text: string, pattern: ReflexoPattern): number {
  return pattern.patterns.reduce((acc, rx) => (rx.test(text) ? acc + 1 : acc), 0);
}

function applyPenalties({
  normalized,
  raw,
  pattern,
  context,
  baseScore,
  matchCount,
}: {
  normalized: string;
  raw: string;
  pattern: ReflexoPattern;
  context: PlanHintsContext;
  baseScore: number;
  matchCount: number;
}): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = baseScore;

  const length = normalized.length;
  if (length < 30) {
    score -= 0.18;
    notes.push("input_curto");
  } else if (length < 60) {
    score -= 0.08;
    notes.push("input_medio");
  } else if (length > 240) {
    score += 0.05;
    notes.push("input_longo");
  }

  if (matchCount > 1) {
    score += Math.min(0.08, matchCount * 0.03);
    notes.push("multi_match");
  }

  if (/^oi[!.\s]*$/.test(normalized) || /^ola[!.\s]*$/.test(normalized)) {
    score -= 0.2;
    notes.push("cumprimento_simples");
  }

  const repeated = context.recentUserInputs?.some((prev) => {
    const normPrev = normalize(prev ?? "");
    if (!normPrev) return false;
    const overlap = normPrev.includes(pattern.key);
    return overlap;
  });
  if (repeated) {
    score -= 0.05;
    notes.push("tema_repetido");
  }

  if (context.lastHintKey && context.lastHintKey === pattern.key) {
    score -= 0.04;
    notes.push("mesmo_tema_recente");
  }

  if (/[A-Z]{6,}/.test(raw)) {
    score += 0.03;
    notes.push("alta_intensidade_caps");
  }

  if ((raw.match(/!/g) || []).length >= 3) {
    score += 0.02;
    notes.push("alta_intensidade_exclamacao");
  }

  return { score: clampScore(score), notes };
}

export function planHints(text: string, ctx: PlanHintsContext = {}): EcoHints | null {
  const normalized = normalize(text);
  if (!normalized) return null;

  const matches = REFLEXO_PATTERNS
    .map((pattern) => ({
      pattern,
      matchCount: countPatternMatches(normalized, pattern),
    }))
    .filter((entry) => entry.matchCount > 0);

  if (!matches.length) {
    return null;
  }

  matches.sort((a, b) => {
    if (a.pattern.priority !== b.pattern.priority) {
      return a.pattern.priority - b.pattern.priority;
    }
    return b.matchCount - a.matchCount;
  });

  const best = matches[0];
  const baseScore = baseScoreForPriority(best.pattern.priority);
  const { score, notes } = applyPenalties({
    normalized,
    raw: text,
    pattern: best.pattern,
    context: ctx,
    baseScore,
    matchCount: best.matchCount,
  });

  if (score < 0.4) {
    return null;
  }

  return {
    key: best.pattern.key,
    priority: best.pattern.priority,
    score,
    flags: [...new Set(best.pattern.defaultFlags)],
    emotions: best.pattern.emotions,
    intent: best.pattern.intent,
    notes,
  };
}
