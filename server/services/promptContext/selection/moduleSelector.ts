import { Selector, type DecSnapshot, type ModuleDebugEntry } from "../Selector";
import { planFamilyModules } from "../familyBanditPlanner";
import { ModuleCatalog } from "../moduleCatalog";
import { ordemAbsoluta } from "../matrizPromptBaseV2";
import { log } from "../logger";
import type { EcoDecisionResult } from "../../conversation/ecoDecisionHub";
import type { HeuristicsRuntime } from "../heuristicsV2";
import type { BiasSnapshotResult } from "../pipeline/biasesResolver";
import type { DecisionSignalMap } from "../pipeline/signalsBuilder";

const ABS_FIRST = "developer_prompt.txt";

export const MINIMAL_VITAL_SET = [
  "sistema_identidade.txt",
  "formato_resposta.txt",
  "usomemorias.txt",
  "tecnico_bloco_memoria.txt",
  "metodo_viva_enxuto.txt",
];

const byAbsoluteOrder = (a: string, b: string) =>
  (ordemAbsoluta[a] ?? (a === ABS_FIRST ? 0 : 999)) -
  (ordemAbsoluta[b] ?? (b === ABS_FIRST ? 0 : 999));

export const sortByAbsoluteOrder = byAbsoluteOrder;

const toUnique = (list: string[] | undefined) =>
  Array.from(new Set(Array.isArray(list) ? list : []));

export const ensureDeveloperPromptFirst = (list: string[]) => {
  const set = new Set(list);
  if (!set.has(ABS_FIRST)) list.unshift(ABS_FIRST);
  list.sort(byAbsoluteOrder);
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
};

export function inferIntentModules(texto: string): string[] {
  const t = (texto || "").toLowerCase();

  const wantsRevisit =
    /revisitar/.test(t) ||
    /momento marcante/.test(t) ||
    /emo[cç]?[aã]o forte do passado/.test(t) ||
    /lembran[çc]a/.test(t) ||
    /🔄|🌊/.test(texto);
  if (wantsRevisit) {
    return [
      "eco_memoria_revisitar_passado",
      "eco_observador_presente",
      "eco_corpo_emocao",
    ];
  }

  const wantsBiasCheck =
    /vi[eé]s|vieses|atalho mental|me enganando|heur[ií]stic/.test(t) || /🧩/.test(texto);
  if (wantsBiasCheck) {
    return [
      "eco_heuristica_ancoragem",
      "eco_heuristica_disponibilidade",
      "eco_heuristica_excesso_confianca",
      "eco_heuristica_regressao_media",
      "eco_heuristica_ilusao_validade",
    ];
  }

  const wantsStoic =
    /reflexo estoico|estoic/.test(t) ||
    /sob meu controle|no seu controle/.test(t) ||
    /🪞|🏛️/.test(texto);
  if (wantsStoic) {
    return ["eco_presenca_racional", "eco_identificacao_mente", "eco_fim_do_sofrimento"];
  }

  const wantsCourage =
    /coragem.*expor|me expor mais|vulnerabil/.test(t) || /💬/.test(texto);
  if (wantsCourage) {
    return ["eco_vulnerabilidade_defesas", "eco_vulnerabilidade_mitos", "eco_emo_vergonha_combate"];
  }

  return [];
}

export interface ModuleSelectionParams {
  texto: string;
  ecoDecision: EcoDecisionResult;
  decSnapshot: DecSnapshot;
  decisionSignals: DecisionSignalMap;
  heuristicsRuntime: HeuristicsRuntime | null;
  biasSnapshots: BiasSnapshotResult;
}

export interface ModuleSelectionResult {
  ordered: string[];
  regularModules: ReturnType<typeof Selector.applyModuleMetadata>["regular"];
  footerModules: ReturnType<typeof Selector.applyModuleMetadata>["footers"];
  debugMap: Map<string, ModuleDebugEntry>;
  pinnedSet: Set<string>;
  selection: ReturnType<typeof Selector.applyModuleMetadata>;
}

export async function selectModules({
  texto,
  ecoDecision,
  decSnapshot,
  decisionSignals,
  heuristicsRuntime,
  biasSnapshots,
}: ModuleSelectionParams): Promise<ModuleSelectionResult> {
  const nivel = ecoDecision.openness as 1 | 2 | 3;

  const baseSelection = Selector.selecionarModulosBase({
    nivel,
    intensidade: ecoDecision.intensity,
    flags: ecoDecision.flags,
    hasTechBlock: ecoDecision.hasTechBlock,
  });
  ecoDecision.debug.modules = baseSelection.debug.modules;
  (ecoDecision.debug as any).selectorStages = {
    gates: {
      raw: baseSelection.raw,
      allowed: baseSelection.posGating,
      priorizado: baseSelection.priorizado,
      signals: Object.keys(decisionSignals).sort(),
      active_biases: biasSnapshots.all,
      decayed_active_biases: ecoDecision.decayedActiveBiases,
    },
    biases: {
      active: biasSnapshots.active,
      decayed: ecoDecision.decayedActiveBiases,
    },
  };

  const intentModules = inferIntentModules(texto);
  const flagFooters: string[] = [];
  if (ecoDecision.flags?.useMemories) {
    flagFooters.push("MEMORIA_COSTURA_REGRAS.txt");
  }
  if (ecoDecision.flags?.patternSynthesis) {
    flagFooters.push("SINTETIZADOR_PADRAO.txt");
  }
  const intentAndFlagModules = toUnique([...intentModules, ...flagFooters]);

  const modulesRawBase = ensureDeveloperPromptFirst(
    toUnique([...toUnique(baseSelection.raw), ...intentAndFlagModules])
  );

  const modulesAfterGatingBase = ensureDeveloperPromptFirst(
    baseSelection.posGating
      ? toUnique([...toUnique(baseSelection.posGating), ...intentAndFlagModules])
      : modulesRawBase
  );

  const orderedBase = ensureDeveloperPromptFirst(
    baseSelection.priorizado?.length
      ? toUnique([...toUnique(baseSelection.priorizado), ...intentAndFlagModules])
      : modulesAfterGatingBase
  );

  ecoDecision.banditArms = undefined;
  if (ecoDecision.debug) {
    (ecoDecision.debug as any).bandits = undefined;
  }

  const familyPlan = planFamilyModules(orderedBase, intentAndFlagModules, {
    openness: nivel,
    intensity: ecoDecision.intensity,
    isVulnerable: ecoDecision.isVulnerable,
    flags: ecoDecision.flags,
    signals: decisionSignals,
    heuristicsV2: heuristicsRuntime ?? undefined,
    decayedBiases: biasSnapshots.decayedMap,
  });

  ecoDecision.debug.banditFamilies = familyPlan.decisions;
  const selectorStages = (ecoDecision.debug as any).selectorStages ?? {};

  if (heuristicsRuntime) {
    const heuristicaDecision = familyPlan.decisions.find(
      (entry) => entry.familyId === "heuristica"
    );
    const heuristicsLogEntries = Array.from(heuristicsRuntime.logs.values()).map((entry) => ({
      signal: entry.name,
      current: entry.current,
      decayed: entry.decayed,
      effective: entry.effective,
      source: entry.source,
      last_seen_at: entry.last_seen_at,
      ttl_s: entry.ttl_s,
      cooldown_active: entry.cooldown_active,
      turns_since_fired: entry.turns_since_fired,
      opened_arms: entry.opened_arms.slice(),
      suppressed_by: Array.from(entry.suppressed_by),
    }));

    const pickedArmId = heuristicaDecision?.chosen ?? null;
    if (pickedArmId) {
      heuristicsRuntime.registerSelection(pickedArmId);
    } else {
      heuristicsRuntime.registerSelection(null);
    }

    const pickedSignal = pickedArmId
      ? heuristicsRuntime.moduleSignalMap.get(pickedArmId) ?? null
      : null;

    const heuristicsStage = {
      signals: heuristicsLogEntries,
      picked: heuristicaDecision
        ? {
            family: heuristicaDecision.familyId,
            arm_id: heuristicaDecision.chosen ?? null,
            signal: pickedSignal,
          }
        : { family: "heuristica", arm_id: null, signal: null },
      active_biases: biasSnapshots.active,
      decayed_active_biases: ecoDecision.decayedActiveBiases,
    };

    selectorStages.heuristics = heuristicsStage;

    log.info({
      selector_stage: "heuristics_eval",
      signals: heuristicsStage.signals.map((entry) => ({
        signal: entry.signal,
        effective_score: Number(entry.effective.toFixed(3)),
        opened_arms: entry.opened_arms,
        suppressed_by: entry.suppressed_by,
      })),
      picked_arm: heuristicsStage.picked?.arm_id ?? null,
      active_biases: biasSnapshots.active,
      decayed_active_biases: ecoDecision.decayedActiveBiases,
    });
  }

  selectorStages.family = {
    decisions: familyPlan.decisions,
    signals: Object.keys(decisionSignals).sort(),
  };

  if (Array.isArray(ecoDecision.debug.modules)) {
    for (const decision of familyPlan.decisions) {
      if (!decision.chosen) continue;
      const entry: ModuleDebugEntry = {
        id: decision.chosen,
        source: "bandit",
        activated: decision.chosenBy === "ts",
        reason: decision.chosenBy,
      };
      ecoDecision.debug.modules.push(entry);
    }
  }

  const banditTokensPlanned = familyPlan.decisions.reduce(
    (acc, decision) => acc + (Number.isFinite(decision.tokensPlanned) ? decision.tokensPlanned : 0),
    0
  );
  (ecoDecision.debug as any).banditPlan = {
    decisions: familyPlan.decisions,
    excluded: familyPlan.excluded,
    dependencies: familyPlan.dependencies,
    tokensPlanned: banditTokensPlanned,
  };
  (ecoDecision.debug as any).selectorStages = {
    ...selectorStages,
    family: {
      decisions: familyPlan.decisions,
      signals: Object.keys(decisionSignals).sort(),
    },
  };

  let ordered = ensureDeveloperPromptFirst(
    toUnique([...familyPlan.modules, ...intentAndFlagModules])
  );

  for (const coreName of MINIMAL_VITAL_SET) {
    if (!ordered.includes(coreName)) {
      ordered.push(coreName);
    }
  }

  for (const coreName of MINIMAL_VITAL_SET) {
    if (!ordered.includes(coreName)) {
      ordered.push(coreName);
    }
  }

  const candidates = await ModuleCatalog.load(ordered);
  const usableCandidates = candidates.filter((candidate) => {
    if (candidate.hadContent) {
      return true;
    }
    log.debug("module_missing", { requested: candidate.name, reason: "empty_content" });
    return false;
  });
  const selection = Selector.applyModuleMetadata({
    dec: decSnapshot,
    baseOrder: ordered,
    candidates: usableCandidates,
  });

  const footerModules = selection.footers;
  const pinnedSet = new Set<string>([
    ABS_FIRST,
    ...MINIMAL_VITAL_SET,
    ...footerModules.map((f) => f.name),
  ]);

  return {
    ordered,
    regularModules: selection.regular,
    footerModules,
    debugMap: selection.debug,
    pinnedSet,
    selection,
  };
}
