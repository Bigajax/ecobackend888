import { log } from "./logger";

export type HeuristicSource = "pattern" | "behavior" | "nlp";

export interface HeuristicSignalPayload {
  score: number;
  source: HeuristicSource;
  last_seen_at: string;
  ttl_s: number;
}

export interface HeuristicSignalDetail {
  signal: string;
  currentScore: number;
  decayedScore: number;
  effectiveScore: number;
  lastSeenAt: string;
  ttlSeconds: number;
  source: HeuristicSource;
  cooldownActive: boolean;
  turnsSinceFired: number | null;
  passesDefault: boolean;
  suppressedByCooldown: boolean;
}

export interface HeuristicLogEntryMutable {
  name: string;
  current: number;
  decayed: number;
  effective: number;
  source: HeuristicSource;
  last_seen_at: string;
  ttl_s: number;
  cooldown_active: boolean;
  turns_since_fired: number | null;
  opened_arms: string[];
  suppressed_by: Set<string>;
}

export interface HeuristicsRuntime {
  turn: number;
  identityKey: string | null;
  details: Record<string, HeuristicSignalDetail>;
  logs: Map<string, HeuristicLogEntryMutable>;
  moduleSignalMap: Map<string, string>;
  config: { defaultMin: number; maxArms: number; hardOverride: number };
  registerSelection: (armId: string | null) => void;
}

interface EvaluateParams {
  identityKey: string | null;
  textCurrent: string;
  textPrevious?: string | null;
  passiveSignals?: string[];
  flagSignals?: string[];
  halfLifeMinutes: number;
  cooldownTurns: number;
  defaultMin: number;
  maxArms: number;
  hardOverride: number;
}

interface SignalizerOutput {
  signals: Record<string, HeuristicSignalPayload>;
  debug: Record<string, unknown>;
}

type PatternDefinition = {
  base: number;
  increment: number;
  patterns: Array<string | RegExp>;
};

type IdentityState = {
  turn: number;
  signals: Map<string, { lastScore: number; lastSeenAtMs: number; source: HeuristicSource }>;
  lastFiredTurn: Map<string, number>;
};

const DEFAULT_TTL_SECONDS = 1800;
const PASSIVE_SIGNAL_BOOSTS: Record<string, Array<{ signal: string; boost: number }>> = {
  typing_bursts: [
    { signal: "urgency", boost: 0.12 },
  ],
  fast_followup: [
    { signal: "rumination", boost: 0.15 },
    { signal: "urgency", boost: 0.08 },
  ],
  message_edits: [
    { signal: "perfectionism", boost: 0.14 },
  ],
};

const PATTERN_DEFINITIONS: Record<string, PatternDefinition> = {
  negation: {
    base: 0.48,
    increment: 0.08,
    patterns: [
      /\bnao posso\b/,
      /\bnao consigo\b/,
      /\bnunca\b/,
      /\bjamais\b/,
      /\bninguem\b/,
      /\bnenhum[ao]?\b/,
      /\bnada funciona\b/,
    ],
  },
  uncertainty: {
    base: 0.5,
    increment: 0.07,
    patterns: [
      /\bnao sei\b/,
      /\bnao tenho certeza\b/,
      /\bincerto\b/,
      /\bduvida\b/,
      /\bacho que\b/,
      /\btalvez\b/,
      /\bpode ser que\b/,
    ],
  },
  urgency: {
    base: 0.55,
    increment: 0.09,
    patterns: [
      /\bpreciso resolver agora\b/,
      /\bpreciso agir\b/,
      /\bnao aguento mais\b/,
      /\burgente\b/,
      /\bpra ontem\b/,
      /\bimediat[oa]\b/,
      /!!!+/,
      /\bdesesperad[ao]\b/,
    ],
  },
  self_blame: {
    base: 0.6,
    increment: 0.08,
    patterns: [
      /\bminha culpa\b/,
      /\bculp[ao]d[ao]?\b/,
      /\bdeveria ter\b/,
      /\bfiz tudo errado\b/,
      /\berrei feio\b/,
      /\bsempre estrago\b/,
    ],
  },
  catastrophizing: {
    base: 0.56,
    increment: 0.08,
    patterns: [
      /\bnada vai dar certo\b/,
      /\btudo perdido\b/,
      /\bdesastre\b/,
      /\bnunca vai melhorar\b/,
      /\bso vejo tragedia\b/,
      /\bvai dar tudo errado\b/,
    ],
  },
  rumination: {
    base: 0.52,
    increment: 0.08,
    patterns: [
      /\bnao paro de pensar\b/,
      /\bfico revivendo\b/,
      /\bvolto sempre nisso\b/,
      /\bpensando nisso o tempo todo\b/,
      /\brepasso mentalmente\b/,
      /\bsempre volto nessa historia\b/,
    ],
  },
  people_pleasing: {
    base: 0.5,
    increment: 0.08,
    patterns: [
      /\bnao sei dizer nao\b/,
      /\bpreciso agradar\b/,
      /\bagradar todo mundo\b/,
      /\bmedo de decepcionar\b/,
      /\bmedo de desapontar\b/,
      /\bcoloco todos antes de mim\b/,
    ],
  },
  perfectionism: {
    base: 0.57,
    increment: 0.07,
    patterns: [
      /\btem que ser perfeito\b/,
      /\bnao posso errar\b/,
      /\bperfeccionista\b/,
      /\bpreciso fazer tudo perfeito\b/,
      /\berro nao e opcao\b/,
      /\bnao aceito falhas\b/,
    ],
  },
  avoidance: {
    base: 0.46,
    increment: 0.08,
    patterns: [
      /\bestou evitando\b/,
      /\badi[ao]ando\b/,
      /\bsempre procrastino\b/,
      /\bfujo disso\b/,
      /\bdepois eu vejo\b/,
      /\bnao encaro\b/,
    ],
  },
};

const signalizerLogger = log.withContext("heuristic-signalizer");

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function safePassiveSignals(input?: string[] | null): string[] {
  if (!input) return [];
  return input
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter((item) => item.length > 0);
}

function collectPassiveBoosts(signals?: string[] | null): Record<string, number> {
  const boosts: Record<string, number> = {};
  for (const passive of safePassiveSignals(signals)) {
    const mappings = PASSIVE_SIGNAL_BOOSTS[passive];
    if (!mappings) continue;
    for (const mapping of mappings) {
      boosts[mapping.signal] = Math.max(
        boosts[mapping.signal] ?? 0,
        mapping.boost
      );
    }
  }
  return boosts;
}

function analyzePatterns(text: string): { payloads: Record<string, HeuristicSignalPayload>; matches: Record<string, string[]> } {
  const normalized = normalizeText(text);
  const payloads: Record<string, HeuristicSignalPayload> = {};
  const matches: Record<string, string[]> = {};
  const nowIso = new Date().toISOString();

  for (const [signal, definition] of Object.entries(PATTERN_DEFINITIONS)) {
    let hits = 0;
    const hitTokens: string[] = [];
    for (const pattern of definition.patterns) {
      if (typeof pattern === "string") {
        if (normalized.includes(pattern)) {
          hits += 1;
          hitTokens.push(pattern);
        }
      } else if (pattern.test(normalized)) {
        hits += 1;
        hitTokens.push(pattern.source);
      }
    }
    if (hits > 0) {
      const score = Math.min(1, definition.base + (hits - 1) * definition.increment);
      payloads[signal] = {
        score,
        source: "pattern",
        last_seen_at: nowIso,
        ttl_s: DEFAULT_TTL_SECONDS,
      };
      matches[signal] = hitTokens;
    }
  }

  return { payloads, matches };
}

function applyFlagSignals(
  payloads: Record<string, HeuristicSignalPayload>,
  flagSignals: string[] | undefined,
  nowIso: string
) {
  if (!Array.isArray(flagSignals) || flagSignals.length === 0) return;
  for (const signal of flagSignals) {
    if (!signal) continue;
    const existing = payloads[signal];
    const score = existing ? Math.max(existing.score, 0.78) : 0.78;
    payloads[signal] = {
      score,
      source: "nlp",
      last_seen_at: nowIso,
      ttl_s: DEFAULT_TTL_SECONDS,
    };
  }
}

function applyPassiveBoosts(
  payloads: Record<string, HeuristicSignalPayload>,
  boosts: Record<string, number>,
  nowIso: string
) {
  const entries = Object.entries(boosts);
  if (!entries.length) return;
  for (const [signal, boost] of entries) {
    if (boost <= 0) continue;
    const existing = payloads[signal];
    const baseScore = existing?.score ?? 0;
    const newScore = Math.min(1, Math.max(baseScore, baseScore + boost));
    const baseSource = existing?.source ?? "pattern";
    const source: HeuristicSource = baseSource === "nlp" ? "nlp" : "behavior";
    payloads[signal] = {
      score: newScore,
      source,
      last_seen_at: nowIso,
      ttl_s: DEFAULT_TTL_SECONDS,
    };
  }
}

function runSignalizer(params: {
  textCurrent: string;
  flagSignals?: string[];
  passiveSignals?: string[];
}): SignalizerOutput {
  const nowIso = new Date().toISOString();
  const { payloads, matches } = analyzePatterns(params.textCurrent ?? "");
  applyFlagSignals(payloads, params.flagSignals, nowIso);
  const passiveBoosts = collectPassiveBoosts(params.passiveSignals);
  applyPassiveBoosts(payloads, passiveBoosts, nowIso);
  return { signals: payloads, debug: { matches, passiveBoosts } };
}

class HeuristicsEngine {
  private readonly identities = new Map<string, IdentityState>();

  evaluate(params: EvaluateParams): HeuristicsRuntime | null {
    const {
      identityKey,
      textCurrent,
      passiveSignals,
      flagSignals,
      halfLifeMinutes,
      cooldownTurns,
      defaultMin,
      maxArms,
      hardOverride,
    } = params;

    const trimmed = typeof textCurrent === "string" ? textCurrent.trim() : "";
    if (!trimmed.length && (!flagSignals || flagSignals.length === 0)) {
      return {
        turn: 0,
        identityKey,
        details: {},
        logs: new Map(),
        moduleSignalMap: new Map(),
        config: { defaultMin, maxArms, hardOverride },
        registerSelection: () => undefined,
      };
    }

    const identityState = identityKey ? this.ensureState(identityKey) : null;
    const nowMs = Date.now();
    const ttlSeconds = DEFAULT_TTL_SECONDS;
    const ttlMs = ttlSeconds * 1000;

    let turn = 0;
    if (identityState) {
      identityState.turn += 1;
      turn = identityState.turn;
    }

    let signalizerOutput: SignalizerOutput;
    try {
      signalizerOutput = runSignalizer({
        textCurrent: trimmed,
        flagSignals,
        passiveSignals,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      signalizerLogger.warn("signalizer_failed", { message });
      return null;
    }

    const details: Record<string, HeuristicSignalDetail> = {};
    const logs = new Map<string, HeuristicLogEntryMutable>();
    const moduleSignalMap = new Map<string, string>();
    const union = new Set<string>();
    Object.keys(signalizerOutput.signals ?? {}).forEach((signal) => union.add(signal));
    if (identityState) {
      identityState.signals.forEach((_value, key) => union.add(key));
    }

    for (const signal of union) {
      const raw = signalizerOutput.signals?.[signal] ?? null;
      const stateEntry = identityState?.signals.get(signal) ?? null;

      const previousLastSeenMs = stateEntry?.lastSeenAtMs ?? nowMs;
      const ageMs = nowMs - previousLastSeenMs;
      if (!raw && ageMs > ttlMs) {
        identityState?.signals.delete(signal);
        continue;
      }

      const lastScore = stateEntry?.lastScore ?? 0;
      const baseSource = stateEntry?.source ?? "pattern";
      const source = raw?.source ?? baseSource;
      const currentScore = raw?.score ?? 0;
      const lastSeenMs = raw ? nowMs : previousLastSeenMs;
      const lastSeenIso = new Date(lastSeenMs).toISOString();

      let decayed = 0;
      if (!Number.isNaN(ageMs) && ageMs > 0 && lastScore > 0) {
        const halfLifeMs = Math.max(1, halfLifeMinutes * 60 * 1000);
        decayed = lastScore * Math.pow(0.5, ageMs / halfLifeMs);
      }
      decayed = Math.max(0, Math.min(1, decayed));

      const effectiveScore = Math.max(currentScore, decayed);
      const lastFiredTurn = identityState?.lastFiredTurn.get(signal) ?? null;
      const turnsSinceFired =
        lastFiredTurn != null && turn > 0 ? turn - lastFiredTurn : null;
      const cooldownActive =
        lastFiredTurn != null && turn > 0 && turn - lastFiredTurn <= cooldownTurns;
      const suppressedByCooldown = cooldownActive && currentScore < hardOverride;
      const passesDefault = effectiveScore >= defaultMin && !suppressedByCooldown;

      details[signal] = {
        signal,
        currentScore,
        decayedScore: decayed,
        effectiveScore,
        lastSeenAt: lastSeenIso,
        ttlSeconds,
        source,
        cooldownActive,
        turnsSinceFired,
        passesDefault,
        suppressedByCooldown,
      };

      const logEntry: HeuristicLogEntryMutable = {
        name: signal,
        current: currentScore,
        decayed,
        effective: effectiveScore,
        source,
        last_seen_at: lastSeenIso,
        ttl_s: ttlSeconds,
        cooldown_active: cooldownActive,
        turns_since_fired: turnsSinceFired,
        opened_arms: [],
        suppressed_by: new Set<string>(),
      };
      if (suppressedByCooldown) {
        logEntry.suppressed_by.add("cooldown");
      }
      if (effectiveScore < defaultMin) {
        logEntry.suppressed_by.add("low_score");
      }
      logs.set(signal, logEntry);

      if (identityState) {
        if (currentScore > 0) {
          identityState.signals.set(signal, {
            lastScore: currentScore,
            lastSeenAtMs: nowMs,
            source,
          });
        } else if (decayed <= 0) {
          identityState.signals.delete(signal);
        }
      }
    }

    const registerSelection = (armId: string | null) => {
      if (!armId) return;
      if (!identityKey) return;
      const signal = moduleSignalMap.get(armId) ?? null;
      if (!signal) return;
      const state = this.identities.get(identityKey);
      if (!state) return;
      state.lastFiredTurn.set(signal, state.turn);
    };

    return {
      turn,
      identityKey,
      details,
      logs,
      moduleSignalMap,
      config: { defaultMin, maxArms, hardOverride },
      registerSelection,
    };
  }

  private ensureState(identityKey: string): IdentityState {
    let state = this.identities.get(identityKey);
    if (!state) {
      state = {
        turn: 0,
        signals: new Map(),
        lastFiredTurn: new Map(),
      };
      this.identities.set(identityKey, state);
    }
    return state;
  }
}

const engine = new HeuristicsEngine();

export function evaluateHeuristicSignals(params: EvaluateParams): HeuristicsRuntime | null {
  try {
    const passiveSignals = Array.isArray(params.passiveSignals)
      ? params.passiveSignals
      : undefined;
    const flagSignals = Array.isArray(params.flagSignals)
      ? params.flagSignals
      : undefined;

    return engine.evaluate({
      ...params,
      passiveSignals,
      flagSignals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.withContext("heuristics-v2").warn("evaluate_failed", { message });
    return null;
  }
}
