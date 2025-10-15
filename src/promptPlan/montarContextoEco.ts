import mixpanel from "../../server/lib/mixpanel";
import { solveKnapsack, type Candidato, type KnapsackResult } from "../orchestrator/knapsack";
import { loadBanditState, persistBanditState } from "../bandits/storage";
import { pickArm, type Arm, type BanditState, type Pilar } from "../bandits/thompson";

export type RetrieveMode = "FAST" | "DEEP";

export interface HistoricoVpt {
  mean: number;
  ci?: [number, number];
  priorPeso?: number;
  tokens?: number;
}

export interface MontarContextoEcoParams {
  responseId: string;
  userId?: string;
  retrieveMode: RetrieveMode;
  intensidadeDetectada: number;
  memIdsUsadas: string[];
  historicoVpt?: Record<string, HistoricoVpt>;
  moduleTokens?: Partial<Record<string, number>>;
  now?: Date;
}

export interface PilarArmSelection {
  pilar: Pilar;
  arm: Arm;
  moduleId: string;
  responseId: string;
}

export interface MontarContextoEcoResult {
  baseModules: string[];
  selecionados: string[];
  tokensAditivos: number;
  ganhoEstimado: number;
  banditSelections: PilarArmSelection[];
  banditState: BanditState;
  knapsack: KnapsackResult;
  retrieveMode: RetrieveMode;
  responseId: string;
  userId?: string;
  intensidadeDetectada: number;
  memIdsUsadas: string[];
}

const BASE_MODULES = [
  "IDENTIDADE_min",
  "ECO_ESTRUTURA_min",
  "USOMEMORIAS",
  "BLOCO_TECNICO",
  "METODO_VIVA_ENXUTO_min",
];

const PILARES: Pilar[] = ["Linguagem", "Encerramento", "Modulacao"];

const DEFAULT_TOKENS: Record<Arm, number> = {
  full: 320,
  mini: 180,
  rules: 120,
};

const DEFAULT_PRIOR = 0.6;

function resolveModuleId(pilar: Pilar, arm: Arm): string {
  return `${pilar.toLowerCase()}_${arm}`;
}

function resolveTokens(moduleId: string, arm: Arm, overrides?: Partial<Record<string, number>>): number {
  if (overrides && typeof overrides[moduleId] === "number") {
    return overrides[moduleId]!;
  }

  return DEFAULT_TOKENS[arm];
}

function buildCandidate(
  pilar: Pilar,
  arm: Arm,
  historico?: Record<string, HistoricoVpt>,
  overrides?: Partial<Record<string, number>>
): Candidato {
  const moduleId = resolveModuleId(pilar, arm);
  const stats = historico?.[moduleId];

  return {
    id: moduleId,
    tokens: resolveTokens(moduleId, arm, overrides),
    priorPeso: stats?.priorPeso ?? 1,
    vptMean: stats?.mean ?? DEFAULT_PRIOR,
    vptCI: stats?.ci,
  };
}

async function trackBanditPick(selection: PilarArmSelection, timestamp: Date): Promise<void> {
  try {
    mixpanel.track("Bandit_Arm_Pick", {
      pilar: selection.pilar,
      arm: selection.arm,
      module_id: selection.moduleId,
      response_id: selection.responseId,
      ts: timestamp.toISOString(),
    });
  } catch (error) {
    console.error("[montarContextoEco] mixpanel_bandit_pick_error", error);
  }
}

async function trackKnapsackDecision(
  responseId: string,
  result: KnapsackResult,
  budget: number
): Promise<void> {
  try {
    mixpanel.track("Knapsack_Decision", {
      response_id: responseId,
      budget,
      adotados: result.adotados.map((c) => c.id),
      ganho_estimado: result.marginalGain,
      tokens_aditivos: result.tokensAdotados,
    });
  } catch (error) {
    console.error("[montarContextoEco] mixpanel_knapsack_error", error);
  }
}

export async function montarContextoEco(
  params: MontarContextoEcoParams
): Promise<MontarContextoEcoResult> {
  const timestamp = params.now ?? new Date();
  const budget = Number(process.env.ECO_BUDGET_ADITIVO_TOKENS ?? 800);
  const banditState = await loadBanditState();
  const selections: PilarArmSelection[] = [];

  for (const pilar of PILARES) {
    const arm = pickArm(pilar, banditState);
    const moduleId = resolveModuleId(pilar, arm);
    selections.push({ pilar, arm, moduleId, responseId: params.responseId });
  }

  await persistBanditState(banditState);

  const candidatos = selections.map((selection) =>
    buildCandidate(selection.pilar, selection.arm, params.historicoVpt, params.moduleTokens)
  );

  const knapsack = solveKnapsack(budget, candidatos);
  const selecionados = [...BASE_MODULES, ...knapsack.adotados.map((c) => c.id)];

  await Promise.all([
    ...selections.map((selection) => trackBanditPick(selection, timestamp)),
    trackKnapsackDecision(params.responseId, knapsack, budget),
  ]);

  return {
    baseModules: BASE_MODULES,
    selecionados,
    tokensAditivos: knapsack.tokensAdotados,
    ganhoEstimado: knapsack.marginalGain,
    banditSelections: selections,
    banditState,
    knapsack,
    retrieveMode: params.retrieveMode,
    responseId: params.responseId,
    userId: params.userId,
    intensidadeDetectada: params.intensidadeDetectada,
    memIdsUsadas: params.memIdsUsadas,
  };
}
