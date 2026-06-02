import * as path from "path";
import { promises as fs } from "fs";
import { ModuleStore } from "./ModuleStore";
import { log } from "./logger";
import { createHttpError, isHttpError } from "../../utils/http";
import { getAssetsRoot } from "../../src/utils/assetsRoot";

export type IdentityModule = { name: string; text: string; sourcePath?: string };

const PROMPT_SUBPATH = "prompts";
const PROMPT_EXT = ".txt";

const DEFAULT_REQUIRED_PROMPTS = [
  `${PROMPT_SUBPATH}/BASE_PROMPT.txt`,
  `${PROMPT_SUBPATH}/BLOCO_TECNICO.txt`,
  `${PROMPT_SUBPATH}/ESTRUTURA_PADRAO.txt`,
  `${PROMPT_SUBPATH}/INTRO_INICIAL.txt`,
  `${PROMPT_SUBPATH}/POLICY_MEMORIA.txt`,
];

const PRIMARY_ASSETS_ROOT = path.resolve(getAssetsRoot());
const ADDITIONAL_ASSET_ROOTS = [
  path.resolve(process.cwd(), "server", "assets"),
  path.resolve(process.cwd(), "dist", "assets"),
  path.resolve(process.cwd(), "server", "dist", "assets"),
];

const ASSET_ROOTS = dedupePaths([PRIMARY_ASSETS_ROOT, ...ADDITIONAL_ASSET_ROOTS]);

const PROMPT_DIR_CANDIDATES = dedupePaths(
  ASSET_ROOTS.map((root) => path.join(root, PROMPT_SUBPATH))
);

const MANIFEST_CANDIDATES = dedupePaths(
  ASSET_ROOTS.map((root) => path.join(root, "MANIFEST.json"))
);

type PromptStatus =
  | { state: "unknown"; checkedAt: null }
  | { state: "ready"; checkedAt: string; files: Array<{ path: string; bytes: number }> }
  | { state: "error"; checkedAt: string; reason: string; details?: Record<string, unknown> | null };

let promptStatus: PromptStatus = { state: "unknown", checkedAt: null };

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    const normalized = path.resolve(raw);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function markPromptsReady(modules: IdentityModule[]) {
  promptStatus = {
    state: "ready",
    checkedAt: new Date().toISOString(),
    files: modules.map((module) => ({
      path: module.sourcePath ?? path.posix.join(PROMPT_SUBPATH, module.name),
      bytes: Buffer.byteLength(module.text, "utf8"),
    })),
  };
}

function markPromptsError(reason: string, details?: Record<string, unknown> | null) {
  promptStatus = {
    state: "error",
    checkedAt: new Date().toISOString(),
    reason,
    details: details ?? null,
  };
}

export function getEcoPromptStatus(): PromptStatus {
  return promptStatus;
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function loadPromptManifest(): Promise<string[] | null> {
  for (const candidate of MANIFEST_CANDIDATES) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const parsed = JSON.parse(raw);
      const required = Array.isArray(parsed?.requiredPrompts)
        ? parsed.requiredPrompts.filter((entry: unknown) => typeof entry === "string")
        : [];
      if (required.length > 0) {
        return required as string[];
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        log.warn("[identityModules] failed to read manifest", {
          path: candidate,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return null;
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

function normalizePromptEntry(entry: string): { full: string; file: string } {
  const normalized = entry.replace(/\\/g, "/").replace(/^\.\//, "");
  const withPrefix = normalized.startsWith(`${PROMPT_SUBPATH}/`)
    ? normalized
    : `${PROMPT_SUBPATH}/${normalized}`;
  const file = path.posix.basename(withPrefix);
  return { full: withPrefix, file };
}

async function readPromptContent(entry: { full: string; file: string }): Promise<string | null> {
  const canonical = await ModuleStore.read(entry.full);
  if (canonical && canonical.trim().length > 0) {
    return canonical.trim();
  }

  if (entry.file !== entry.full) {
    const fallback = await ModuleStore.read(entry.file);
    if (fallback && fallback.trim().length > 0) {
      return fallback.trim();
    }
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
    name: module.sourcePath ?? path.posix.join(PROMPT_SUBPATH, module.name),
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
  try {
    const manifestEntries = await loadPromptManifest();
    const requiredEntries = (manifestEntries ?? DEFAULT_REQUIRED_PROMPTS).map(normalizePromptEntry);
    const requiredFullSet = new Set(requiredEntries.map((entry) => entry.full));
    const requiredByFile = new Map(requiredEntries.map((entry) => [entry.file, entry.full]));

    const availableFiles = new Set<string>();

    for (const candidate of PROMPT_DIR_CANDIDATES) {
      if (!(await dirExists(candidate))) continue;
      for (const file of await listPromptFiles(candidate)) {
        availableFiles.add(file);
      }
    }

    if (availableFiles.size === 0) {
      // Legacy prompts/ directory not found, but that's okay - new system uses modules.manifest.json
      log.warn("[identityModules] legacy_prompts_directory_not_found", {
        reason: "LEGACY_SYSTEM_DISABLED",
        searched: PROMPT_DIR_CANDIDATES,
        note: "Using new modules.manifest.json + ModuleStore instead",
      });
      // Mark as ready with empty list (graceful degradation)
      markPromptsReady([]);
      return [];
    }

    const orderedEntries: Array<{ full: string; file: string }> = [...requiredEntries];
    const extras = Array.from(availableFiles)
      .map((file) => normalizePromptEntry(file))
      .filter((entry) => !requiredFullSet.has(entry.full))
      .sort((a, b) => a.full.localeCompare(b.full));

    orderedEntries.push(...extras);

    const modules: IdentityModule[] = [];
    const missingRequired = new Set<string>();

    for (const entry of orderedEntries) {
      const content = await readPromptContent(entry);
      if (content && content.length > 0) {
        modules.push({ name: entry.file, text: content, sourcePath: entry.full });
      } else {
        log.warn("[identityModules] prompt file missing or empty", { file: entry.full });
        const canonical = requiredByFile.get(entry.file) ?? entry.full;
        if (requiredFullSet.has(canonical)) {
          missingRequired.add(canonical);
        }
      }
    }

    for (const required of requiredEntries) {
      if (!modules.some((module) => module.sourcePath === required.full)) {
        missingRequired.add(required.full);
      }
    }

    if (modules.length === 0 || missingRequired.size > 0) {
      const details = {
        reason: "PROMPT_MISSING",
        missing: Array.from(missingRequired),
        available: modules.map((module) => module.sourcePath ?? module.name),
        required: requiredEntries.map((entry) => entry.full),
      };
      markPromptsError("PROMPT_MISSING", details);
      throw buildPromptLoadError(details);
    }

    markPromptsReady(modules);
    logManifestOnce(modules);

    return modules;
  } catch (error) {
    if (promptStatus.state !== "error") {
      markPromptsError("PROMPT_LOAD_FAILED", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
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
    const reason =
      (payload && typeof payload === "object" && "reason" in payload
        ? (payload as Record<string, unknown>).reason
        : undefined) ?? "PROMPT_LOAD_FAILED";
    console.error({
      code: "ECO_PROMPT_NOT_LOADED",
      reason,
      details: payload ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    process.exit(1);
  }
}
