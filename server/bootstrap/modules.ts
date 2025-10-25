import path from "path";
import fs from "fs";
import { ModuleCatalog } from "../domains/prompts/ModuleCatalog";
import { log } from "../services/promptContext/logger";

let bootPromise: Promise<void> | null = null;
let booted = false;

function resolveFirstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    try {
      if (fs.statSync(resolved).isDirectory()) {
        return resolved;
      }
    } catch {
      // tenta próximo
    }
  }
  return null;
}

function uniqueRoots(entries: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const resolved = path.resolve(entry);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

/**
 * Define as roots de módulos (txt/md) e constrói o índice.
 * - Suporta override por env ECO_MODULES_DIR (lista separada por vírgula).
 * - Procura em prod: dist/assets (pacote) e em dev: server/assets (workspace).
 */
async function runConfigureModuleStore() {
  const cwd = process.cwd();

  const envRoots = (process.env.ECO_MODULES_DIR || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => (path.isAbsolute(p) ? p : path.join(cwd, p)))
    .map((candidate) => resolveFirstExisting([candidate]))
    .filter((candidate): candidate is string => Boolean(candidate));

  const packagedRoot = resolveFirstExisting([
    path.join(cwd, "dist", "assets"),
    path.join(cwd, "server", "dist", "assets"),
    path.resolve(__dirname, "../assets"),
    path.resolve(__dirname, "../../dist", "assets"),
  ]);

  const workspaceRoot = resolveFirstExisting([
    path.join(cwd, "server", "assets"),
    path.resolve(__dirname, "../assets"),
  ]);

  const legacyRoot = resolveFirstExisting([
    path.join(cwd, "assets"),
    path.resolve(__dirname, "../../assets"),
  ]);

  if (legacyRoot) {
    log.warn("[ModuleStore.bootstrap] legacy_assets_detected", { legacyRoot });
  }

  if (packagedRoot && workspaceRoot) {
    log.warn("[ModuleStore.bootstrap] multiple_asset_roots", {
      using: packagedRoot,
      ignored: workspaceRoot,
    });
  }

  const roots = envRoots.length
    ? uniqueRoots(envRoots)
    : uniqueRoots(packagedRoot ? [packagedRoot] : workspaceRoot ? [workspaceRoot] : []);

  ModuleCatalog.configure(roots);
  await ModuleCatalog.buildFileIndexOnce();

  const stats = ModuleCatalog.stats();

  let sampleEntries: Array<{ file: string; hadContent: boolean; bytes: number }> = [];
  if (stats.indexedCount > 0) {
    const names = ModuleCatalog.listIndexed(5);
    for (const file of names) {
      try {
        const content = await ModuleCatalog.read(file);
        const text = typeof content === "string" ? content : "";
        sampleEntries.push({
          file,
          hadContent: text.length > 0,
          bytes: text.length > 0 ? Buffer.byteLength(text, "utf8") : 0,
        });
      } catch {
        sampleEntries.push({ file, hadContent: false, bytes: 0 });
      }
    }
  }

  log.info("[ModuleStore.bootstrap] module_roots_ready", {
    roots,
    filesIndexed: stats.indexedCount,
    envOverride: envRoots.length > 0,
    sample: sampleEntries.map((entry) => entry.file),
  });

  if (sampleEntries.length) {
    log.info("[ModuleStore.bootstrap] module_sample", {
      filesIndexed: stats.indexedCount,
      entries: sampleEntries,
      hadContent: sampleEntries.some((entry) => entry.hadContent),
    });
  }

  if (roots.length === 0) {
    log.warn(
      "[ModuleStore.bootstrap] nenhum diretório de módulos encontrado — usaremos fallbacks inline quando possível. " +
        "Verifique seu processo de build ou configure ECO_MODULES_DIR."
    );
  } else if (stats.indexedCount <= 0) {
    log.error("[ModuleStore.bootstrap] module_index_empty", {
      roots,
    });
  }
  booted = true;
}

export async function configureModuleStore() {
  if (booted) {
    return;
  }
  if (!bootPromise) {
    bootPromise = runConfigureModuleStore()
      .catch((error) => {
        booted = false;
        throw error;
      })
      .finally(() => {
        bootPromise = null;
      });
  }
  return bootPromise;
}

/** Alias conveniente */
export async function bootstrap() {
  return configureModuleStore();
}

// 🔁 Compatibilidade com chamadas existentes: ModuleStore.bootstrap()
;(ModuleCatalog as any).bootstrap = configureModuleStore;

export default configureModuleStore;
