import { qualityAnalyticsStore } from "../../analytics/analyticsStore";

export type Pilar = "Linguagem" | "Encerramento" | "Modulacao";
export type Braco = "_full" | "_mini" | "_rules";

export type BanditSelection = {
  pilar: Pilar;
  arm: Braco;
  baseModule: string;
  module: string;
};

export type BanditSelectionMap = Partial<Record<Pilar, BanditSelection>>;

export const PILAR_BASE_MODULE: Record<Pilar, string> = {
  Linguagem: "LINGUAGEM_NATURAL.txt",
  Encerramento: "ENCERRAMENTO_SENSIVEL.txt",
  Modulacao: "MODULACAO_TOM_REGISTRO.txt",
};

const ARM_PRIORITY: Record<Braco, number> = {
  _full: 0,
  _mini: 1,
  _rules: 2,
};

const PILAR_ARMS: Record<Pilar, Braco[]> = {
  Linguagem: ["_full", "_mini", "_rules"],
  Encerramento: ["_full", "_mini", "_rules"],
  Modulacao: ["_full", "_mini", "_rules"],
};

function sampleStandardNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function resolveBanditModuleName(baseModule: string, arm: Braco): string {
  const trimmed = typeof baseModule === "string" ? baseModule.trim() : "";
  if (!trimmed) return baseModule;
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex === -1) {
    return `${trimmed}${arm}`;
  }
  const prefix = trimmed.slice(0, dotIndex);
  const suffix = trimmed.slice(dotIndex);
  return `${prefix}${arm}${suffix}`;
}

export function pickArm(pilar: Pilar): Braco {
  const arms = PILAR_ARMS[pilar] ?? PILAR_ARMS.Linguagem;
  let bestArm = arms[0] ?? "_full";
  let bestScore = -Infinity;

  for (const arm of arms) {
    const stats = qualityAnalyticsStore.getBanditPosterior(pilar, arm);
    const alpha = Math.max(stats.alpha, 1e-3);
    const beta = Math.max(stats.beta, 1e-3);
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const stddev = Math.sqrt(Math.max(variance, 1e-6));
    const draw = clamp01(mean + stddev * sampleStandardNormal());

    if (draw > bestScore + 1e-6) {
      bestScore = draw;
      bestArm = arm;
      continue;
    }
    if (Math.abs(draw - bestScore) <= 1e-6) {
      if (ARM_PRIORITY[arm] < ARM_PRIORITY[bestArm]) {
        bestArm = arm;
      }
    }
  }

  return bestArm;
}

export function updateArm(pilar: Pilar, arm: Braco, recompensa: number): void {
  if (!Number.isFinite(recompensa)) return;
  qualityAnalyticsStore.recordBanditOutcome(pilar, arm, { reward: recompensa });
}
