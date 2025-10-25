import path from "path";
import fs from "fs";
import { ModuleCatalog } from "../domains/prompts/ModuleCatalog";
import { log } from "../services/promptContext/logger";

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
 * - Procura em prod: dist/assets (pacote) e em dev: assets/ (workspace).
 */
export async function configureModuleStore() {
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
    path.resolve(__dirname, "../dist", "assets"),
    path.resolve(__dirname, "../../dist", "assets"),
  ]);

  const workspaceRoot = resolveFirstExisting([
    path.join(cwd, "assets"),
    path.join(cwd, "server", "assets"),
    path.resolve(__dirname, "../../assets"),
    path.resolve(__dirname, "../..", "assets"),
  ]);

  const roots = envRoots.length
    ? uniqueRoots(envRoots)
    : uniqueRoots([packagedRoot, workspaceRoot]);

  ModuleCatalog.configure(roots);
  await ModuleCatalog.buildFileIndexOnce();

  const stats = ModuleCatalog.stats();

  log.info("[ModuleStore.bootstrap] module_roots_ready", {
    roots,
    filesIndexed: stats.indexedCount,
    envOverride: envRoots.length > 0,
  });

  if (roots.length === 0) {
    log.warn(
      "[ModuleStore.bootstrap] nenhum diretório de módulos encontrado — usaremos fallbacks inline quando possível. " +
        "Verifique seu processo de build ou configure ECO_MODULES_DIR."
    );
  } else if (stats.indexedCount <= 0) {
    log.warn("[ModuleStore.bootstrap] module_index_empty", {
      roots,
    });
  }
}

/** Alias conveniente */
export async function bootstrap() {
  return configureModuleStore();
}

// 🔁 Compatibilidade com chamadas existentes: ModuleStore.bootstrap()
;(ModuleCatalog as any).bootstrap = configureModuleStore;

export default configureModuleStore;
