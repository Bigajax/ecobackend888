export type Pilar = "Linguagem" | "Encerramento" | "Modulacao";
export type Arm = "full" | "mini" | "rules";

export type ArmStats = {
  alpha: number;
  beta: number;
  pulls: number;
};

export type BanditState = Record<Pilar, Record<Arm, ArmStats>>;

type Rng = () => number;

let currentRng: Rng = () => Math.random();

function createSeededRng(seed?: number): Rng {
  if (!seed || !Number.isFinite(seed)) {
    return () => Math.random();
  }

  let state = Math.floor(Math.abs(seed)) % 2147483647;
  if (state === 0) {
    state = 1;
  }

  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function setRng(seed?: number) {
  currentRng = createSeededRng(seed);
}

function getDefaultArmStats(): ArmStats {
  return { alpha: 1, beta: 1, pulls: 0 };
}

function sampleNormal(): number {
  const u1 = currentRng() || Number.EPSILON;
  const u2 = currentRng() || Number.EPSILON;
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  return r * Math.cos(theta);
}

function sampleGamma(shape: number): number {
  if (shape <= 0) {
    throw new Error("Shape parameter must be positive");
  }

  if (shape < 1) {
    const u = currentRng() || Number.EPSILON;
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = currentRng();

    if (u < 1 - 0.0331 * x ** 4) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

export function initBandits(seed?: number): BanditState {
  setRng(seed);

  const state: BanditState = {
    Linguagem: { full: getDefaultArmStats(), mini: getDefaultArmStats(), rules: getDefaultArmStats() },
    Encerramento: { full: getDefaultArmStats(), mini: getDefaultArmStats(), rules: getDefaultArmStats() },
    Modulacao: { full: getDefaultArmStats(), mini: getDefaultArmStats(), rules: getDefaultArmStats() },
  };

  return state;
}

export function pickArm(pilar: Pilar, state: BanditState): Arm {
  const arms = state[pilar];
  let bestArm: Arm = "full";
  let bestScore = -Infinity;

  (Object.keys(arms) as Arm[]).forEach((arm) => {
    const stats = arms[arm];
    const sample = sampleBeta(Math.max(stats.alpha, Number.EPSILON), Math.max(stats.beta, Number.EPSILON));
    if (sample > bestScore) {
      bestScore = sample;
      bestArm = arm;
    }
  });

  return bestArm;
}

export function updateArm(pilar: Pilar, arm: Arm, reward: number, state: BanditState): void {
  const arms = state[pilar];
  const stats = arms[arm];
  const normalized = Math.min(1, Math.max(0, Math.abs(reward)));

  if (reward > 0) {
    stats.alpha += normalized;
  } else if (reward < 0) {
    stats.beta += normalized;
  } else {
    stats.beta += 0.01;
  }

  stats.pulls += 1;
}

export function expectedValue(stats: ArmStats): number {
  const denom = stats.alpha + stats.beta;
  return denom === 0 ? 0.5 : stats.alpha / denom;
}
