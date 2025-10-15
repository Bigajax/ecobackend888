import { promises as fs } from "fs";
import path from "path";
import { BanditState, ArmStats, initBandits, Pilar, Arm } from "./thompson";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "bandits.json");

let inMemoryState: BanditState | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let loadingPromise: Promise<BanditState> | null = null;

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function rehydrateState(raw: any): BanditState {
  const pillars: Pilar[] = ["Linguagem", "Encerramento", "Modulacao"];
  const arms: Arm[] = ["full", "mini", "rules"];
  const state = initBandits();

  for (const pillar of pillars) {
    for (const arm of arms) {
      const stats = (raw?.[pillar]?.[arm] ?? {}) as Partial<ArmStats>;
      state[pillar][arm] = {
        alpha: typeof stats.alpha === "number" && stats.alpha > 0 ? stats.alpha : 1,
        beta: typeof stats.beta === "number" && stats.beta > 0 ? stats.beta : 1,
        pulls: typeof stats.pulls === "number" && stats.pulls >= 0 ? Math.floor(stats.pulls) : 0,
      };
    }
  }

  return state;
}

export async function loadBanditState(seed?: number): Promise<BanditState> {
  if (inMemoryState) {
    return inMemoryState;
  }

  if (!loadingPromise) {
    loadingPromise = (async () => {
      await ensureCacheDir();
      try {
        const raw = await fs.readFile(CACHE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        inMemoryState = rehydrateState(parsed);
      } catch (error) {
        inMemoryState = initBandits(seed);
        await persistBanditState(inMemoryState);
      }

      return inMemoryState!;
    })();
  }

  return loadingPromise;
}

export async function persistBanditState(state: BanditState): Promise<void> {
  inMemoryState = state;
  await ensureCacheDir();
  writeQueue = writeQueue.then(() => fs.writeFile(CACHE_FILE, JSON.stringify(state)));
  await writeQueue;
}

export function getInMemoryBanditState(): BanditState | null {
  return inMemoryState;
}

export function setInMemoryBanditState(state: BanditState): void {
  inMemoryState = state;
}
