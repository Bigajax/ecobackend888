import * as path from "path";
import { promises as fs } from "fs";
import { ModuleStore } from "./ModuleStore";
import { log } from "./logger";
import { createHttpError, isHttpError } from "../../utils/http";

export type IdentityModule = { name: string; text: string };

const PROMPT_SUBPATH = "prompts";
const PROMPT_EXT = ".txt";

const ORDERED_FILES = [
  "eco_prompt_programavel.txt",
  "eco_core_personality.txt",
  "eco_behavioral_instructions.txt",
  "eco_memory_logic.txt",
  "eco_intro_inicial.txt",
];

const REQUIRED_FILES = [...ORDERED_FILES];

const PROMPT_DIR_CANDIDATES = [
  path.resolve(__dirname, "../assets", PROMPT_SUBPATH),
  path.resolve(__dirname, "../../assets", PROMPT_SUBPATH),
  path.resolve(process.cwd(), "dist/assets", PROMPT_SUBPATH),
  path.resolve(process.cwd(), "assets", PROMPT_SUBPATH),
];

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function listPromptFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(PROMPT_EXT))
      .map((entry) => entry.name);
  } catch (error) {
    log.warn("[identityModules] failed to read prompt directory", {
      dir,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function sortByExplicitOrder(files: string[]): string[] {
  const orderMap = new Map<string, number>();
  ORDERED_FILES.forEach((name, index) => {
    orderMap.set(name, index);
  });

  return files
    .slice()
    .sort((a, b) => {
      const weightA = orderMap.has(a) ? orderMap.get(a)! : ORDERED_FILES.length;
      const weightB = orderMap.has(b) ? orderMap.get(b)! : ORDERED_FILES.length;
      if (weightA !== weightB) return weightA - weightB;
      return a.localeCompare(b);
    });
}

async function readPromptContent(file: string): Promise<string | null> {
  const withSubPath = await ModuleStore.read(`${PROMPT_SUBPATH}/${file}`);
  if (withSubPath && withSubPath.trim().length > 0) {
    return withSubPath.trim();
  }

  const direct = await ModuleStore.read(file);
  if (direct && direct.trim().length > 0) {
    return direct.trim();
  }

  return null;
}

let cachedModules: IdentityModule[] | null = null;
let pendingLoad: Promise<IdentityModule[]> | null = null;

let manifestLogged = false;

function logManifestOnce(modules: IdentityModule[]) {
  if (manifestLogged) return;
  manifestLogged = true;
  const manifest = modules.map((module) => ({
    name: module.name,
    bytes: Buffer.byteLength(module.text, "utf8"),
  }));
  console.info("[eco-prompts] loaded", {
    files: manifest,
  });
}

function buildPromptLoadError(extra: Record<string, unknown> = {}) {
  return createHttpError(500, "ECO_PROMPT_NOT_LOADED", "ECO prompt not loaded", extra);
}

async function loadIdentityModulesInternal(): Promise<IdentityModule[]> {
  await ModuleStore.bootstrap();

  const seen = new Set<string>();

  for (const candidate of PROMPT_DIR_CANDIDATES) {
    if (!(await dirExists(candidate))) continue;
    for (const file of await listPromptFiles(candidate)) {
      seen.add(file);
    }
  }

  if (seen.size === 0) {
    throw buildPromptLoadError({
      reason: "PROMPT_DIR_EMPTY",
      searched: PROMPT_DIR_CANDIDATES,
    });
  }

  const ordered = sortByExplicitOrder(Array.from(seen));
  const modules: IdentityModule[] = [];
  const missingRequired = new Set<string>();

  for (const file of ordered) {
    const content = await readPromptContent(file);
    if (content && content.trim().length > 0) {
      modules.push({ name: file, text: content.trim() });
    } else {
      log.warn("[identityModules] prompt file missing or empty", { file });
      if (REQUIRED_FILES.includes(file)) {
        missingRequired.add(file);
      }
    }
  }

  for (const required of REQUIRED_FILES) {
    if (!modules.some((module) => module.name === required)) {
      missingRequired.add(required);
    }
  }

  if (modules.length === 0 || missingRequired.size > 0) {
    throw buildPromptLoadError({
      missing: Array.from(missingRequired),
      available: modules.map((module) => module.name),
    });
  }

  logManifestOnce(modules);

  return modules;
}

export async function loadEcoIdentityModules(): Promise<IdentityModule[]> {
  if (cachedModules) return cachedModules;
  if (!pendingLoad) {
    pendingLoad = loadIdentityModulesInternal().then((result) => {
      cachedModules = result;
      pendingLoad = null;
      return result;
    });
  }
  return pendingLoad;
}

export async function ensureEcoIdentityPromptAvailability(): Promise<void> {
  try {
    await loadEcoIdentityModules();
  } catch (error) {
    const payload = isHttpError(error) ? error.body : undefined;
    console.error("[eco-prompts] failed to load", {
      message: error instanceof Error ? error.message : String(error),
      details: payload ?? null,
    });
    process.exit(1);
  }
}
