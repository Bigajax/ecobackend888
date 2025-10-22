import path from "path";
import fs from "fs";
import { ModuleCatalog } from "../domains/prompts/ModuleCatalog";
import { log } from "../services/promptContext/logger";

const fsp = fs.promises;

function dirIfExists(p: string) {
  try {
    const resolved = path.resolve(p);
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

async function peekFiles(base: string, limit = 5): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string, relative = ""): Promise<void> {
    if (results.length >= limit) return;
    const entries = await fsp.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = relative ? path.posix.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), rel);
        if (results.length >= limit) break;
      } else {
        results.push(rel);
        if (results.length >= limit) break;
      }
    }
  }

  try {
    await walk(base);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [`<error: ${message}>`];
  }

  return results.slice(0, limit);
}

/**
 * Define as roots de módulos (txt/md) e constrói o índice.
 * - Suporta override por env ECO_MODULES_DIR (lista separada por vírgula).
 * - Procura em dev: server/assets/... **e** assets/...
 * - Procura em prod: dist/assets/...
 */
export async function configureModuleStore() {
  const CWD = process.cwd();

  // 1) Override por env (opcional)
  const envRoots = (process.env.ECO_MODULES_DIR || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => (path.isAbsolute(p) ? p : path.join(CWD, p)))
    .map(dirIfExists)
    .filter((p): p is string => Boolean(p));

  const canonicalCandidates = [
    path.join(CWD, "dist", "assets"),
    path.join(CWD, "server", "assets"),
    path.join(CWD, "assets"),
  ].map(dirIfExists);

  const ordered = [...envRoots, ...canonicalCandidates];
  const seen = new Set<string>();
  const roots = ordered
    .filter((p): p is string => Boolean(p))
    .filter((p) => {
      const key = path.resolve(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  ModuleCatalog.configure(roots);
  await ModuleCatalog.buildFileIndexOnce();

  const stats = ModuleCatalog.stats();
  const peekByRoot = await Promise.all(
    roots.map(async (root) => ({ root, sample: await peekFiles(root, 5) }))
  );

  log.info("[ModuleStore.bootstrap] configurado", {
    roots,
    filesIndexed: stats.indexedCount,
    peekByRoot,
  });

  if (roots.length === 0) {
    log.warn(
      "[ModuleStore.bootstrap] nenhum diretório de módulos encontrado — usaremos fallbacks inline quando possível. " +
        "Verifique seu copy:assets ou configure ECO_MODULES_DIR."
    );
  }
}

/** Alias conveniente */
export async function bootstrap() {
  return configureModuleStore();
}

// 🔁 Compatibilidade com chamadas existentes: ModuleStore.bootstrap()
;(ModuleCatalog as any).bootstrap = configureModuleStore;

export default configureModuleStore;
