import { evaluateHeuristicSignals } from "../../server/services/promptContext/heuristicsV2";
import { planFamilyModules } from "../../server/services/promptContext/familyBanditPlanner";
import { ensureModuleManifest } from "../../server/services/promptContext/moduleManifest";
import { qualityAnalyticsStore } from "../../server/services/analytics/analyticsStore";
import { __internals as ContextBuilderInternals } from "../../server/services/promptContext/ContextBuilder";

const { buildDecisionSignals } = ContextBuilderInternals;

describe("HeuristicSignalizer", () => {
  it("combines pattern, behavior and flag signals with proper precedence", () => {
    const identityKey = `test-${Date.now()}-${Math.random()}`;
    const runtime = evaluateHeuristicSignals({
      identityKey,
      textCurrent:
        "Eu nao consigo parar de pensar nisso, parece que nada funciona e eu nunca acerto.",
      passiveSignals: ["fast_followup", "typing_bursts"],
      flagSignals: ["bias:certeza_emocional"],
      halfLifeMinutes: 20,
      cooldownTurns: 2,
      defaultMin: 0.3,
      maxArms: 2,
      hardOverride: 0.8,
    });

    expect(runtime).not.toBeNull();
    const details = runtime?.details ?? {};

    const negation = details["negation"];
    expect(negation?.currentScore).toBeGreaterThanOrEqual(0.48);
    expect(negation?.source).toBe("pattern");
    expect(negation?.passesDefault).toBe(true);

    const rumination = details["rumination"];
    expect(rumination?.currentScore).toBeCloseTo(0.15, 2);
    expect(rumination?.source).toBe("behavior");

    const certeza = details["bias:certeza_emocional"];
    expect(certeza?.currentScore).toBeGreaterThanOrEqual(0.78);
    expect(certeza?.source).toBe("nlp");
    expect(certeza?.passesDefault).toBe(true);
  });
});

describe("Heuristic gating and cooldown", () => {
  const heuristicsModule = "eco_heuristica_certeza_emocional.txt";
  const signalName = "bias:certeza_emocional";
  const identityKey = `heur-${Date.now()}-${Math.random()}`;
  let randomSpy: jest.SpyInstance<number, []>;
  let posteriorSpy: jest.SpyInstance<any, any>;
  const envBackup = {
    shadow: process.env.ECO_BANDIT_SHADOW,
    early: process.env.ECO_BANDIT_EARLY,
    pilot: process.env.ECO_BANDIT_PILOT_PERCENT,
  };

  beforeAll(async () => {
    randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.0001);
    posteriorSpy = jest.spyOn(qualityAnalyticsStore, "getBanditPosterior").mockReturnValue({
      alpha: 1.5,
      beta: 1.5,
      count: 0,
      normalizedMean: 0,
      rewardMean: 0,
      winRate: 0,
      lastUpdated: null,
    });
    process.env.ECO_BANDIT_SHADOW = "0";
    process.env.ECO_BANDIT_EARLY = "0";
    process.env.ECO_BANDIT_PILOT_PERCENT = "100";
    await ensureModuleManifest();
  });

  afterAll(() => {
    randomSpy.mockRestore();
    posteriorSpy.mockRestore();
    if (envBackup.shadow === undefined) delete process.env.ECO_BANDIT_SHADOW;
    else process.env.ECO_BANDIT_SHADOW = envBackup.shadow;
    if (envBackup.early === undefined) delete process.env.ECO_BANDIT_EARLY;
    else process.env.ECO_BANDIT_EARLY = envBackup.early;
    if (envBackup.pilot === undefined) delete process.env.ECO_BANDIT_PILOT_PERCENT;
    else process.env.ECO_BANDIT_PILOT_PERCENT = envBackup.pilot;
  });

  it("suppresses heuristic arm when cooldown is active", () => {
    const baseParams = {
      identityKey,
      textCurrent: "Meu coracao diz que e verdade e parece certo.",
      passiveSignals: [] as string[],
      flagSignals: [signalName],
      halfLifeMinutes: 20,
      cooldownTurns: 2,
      defaultMin: 0.3,
      maxArms: 1,
      hardOverride: 0.8,
    };

    const runtimeFirst = evaluateHeuristicSignals(baseParams);
    expect(runtimeFirst).not.toBeNull();
    const planFirst = planFamilyModules(
      [heuristicsModule],
      [],
      {
        openness: 3,
        intensity: 5,
        isVulnerable: false,
        flags: {} as any,
        signals: {},
        heuristicsV2: runtimeFirst,
      }
    );

    const heurDecision1 = planFirst.decisions.find((entry) => entry.familyId === "heuristica");
    expect(heurDecision1).toBeDefined();
    const eligibleFirst = heurDecision1?.eligibleArms.find((arm) => arm.id === heuristicsModule);
    expect(eligibleFirst?.gatePassed).toBe(true);

    runtimeFirst?.registerSelection(heuristicsModule);

    const runtimeSecond = evaluateHeuristicSignals(baseParams);
    expect(runtimeSecond?.details[signalName]?.suppressedByCooldown).toBe(true);

    const planSecond = planFamilyModules(
      [heuristicsModule],
      [],
      {
        openness: 3,
        intensity: 5,
        isVulnerable: false,
        flags: {} as any,
        signals: {},
        heuristicsV2: runtimeSecond,
      }
    );

    const heurDecision2 = planSecond.decisions.find((entry) => entry.familyId === "heuristica");
    expect(heurDecision2).toBeDefined();
    const eligibleSecond = heurDecision2?.eligibleArms.find((arm) => arm.id === heuristicsModule);
    expect(eligibleSecond?.gatePassed).toBe(false);
  });
});

describe("ContextBuilder decision signals", () => {
  it("prefers heuristics runtime signals when available", () => {
    const runtimeMock = {
      details: {
        "bias:ancoragem": {
          signal: "bias:ancoragem",
          currentScore: 0.62,
          decayedScore: 0,
          effectiveScore: 0.62,
          lastSeenAt: new Date().toISOString(),
          ttlSeconds: 1800,
          source: "pattern",
          cooldownActive: false,
          turnsSinceFired: null,
          passesDefault: true,
          suppressedByCooldown: false,
        },
      },
    } as any;

    const signals = buildDecisionSignals(
      {
        texto: "texto neutro",
        heuristicaFlags: {} as any,
        intensity: 3,
        memsSemelhantes: [],
      },
      runtimeMock
    );

    expect(signals["bias:ancoragem"]).toBe(true);
  });

  it("falls back to legacy pattern and flag detection when heuristics are disabled", () => {
    const text = "No fundo eu sei que e verdade e meu coracao diz isso.";
    const signals = buildDecisionSignals(
      {
        texto: text,
        heuristicaFlags: { ancoragem: true } as any,
        intensity: 3,
        memsSemelhantes: [],
      },
      null
    );

    expect(signals["bias:certeza_emocional"]).toBe(true);
    expect(signals["bias:ancoragem"]).toBe(true);
  });
});
