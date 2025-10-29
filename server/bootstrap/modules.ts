import path from "path";
import fs from "fs";
import { ModuleCatalog } from "../domains/prompts/ModuleCatalog";
import { log } from "../services/promptContext/logger";

let bootPromise: Promise<void> | null = null;
let booted = false;

const REQUIRED_ASSET_FILES: Array<{ relative: string; placeholder: string }> = [
  {
    relative: path.join("modulos_core", "developer_prompt.txt"),
    placeholder:
      "Placeholder developer prompt. Substitua pelo conteúdo definitivo para evitar respostas incompletas.",
  },
  {
    relative: path.join("modulos_core", "usomemorias.txt"),
    placeholder:
      "Placeholder uso de memórias. Adicione instruções reais para habilitar o módulo corretamente.",
  },
];

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
function ensureRequiredWorkspaceFiles(workspaceRoot: string) {
  for (const file of REQUIRED_ASSET_FILES) {
    const filePath = path.join(workspaceRoot, file.relative);
    if (fs.existsSync(filePath)) {
      continue;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.placeholder, "utf8");
    log.warn("[ModuleStore.bootstrap] placeholder_created", { filePath });
  }
}

function resolveSingleCandidate(
  cwd: string,
  candidate: string | null | undefined
): string | null {
  if (!candidate) {
    return null;
  }
  const normalized = path.isAbsolute(candidate) ? candidate : path.join(cwd, candidate);
  return resolveFirstExisting([normalized]);
}

async function runConfigureModuleStore() {
  const cwd = process.cwd();
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";

  const serverAssetsRoot = path.join(cwd, "server", "assets");
  if (fs.existsSync(serverAssetsRoot)) {
    ensureRequiredWorkspaceFiles(serverAssetsRoot);
  }

  const workspaceRoot = resolveFirstExisting([
    path.resolve(__dirname, "assets"),
    path.resolve(__dirname, "../assets"),
    serverAssetsRoot,
  ]);

  const envRoots = (process.env.ECO_MODULES_DIR || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => (path.isAbsolute(p) ? p : path.join(cwd, p)))
    .map((candidate) => resolveFirstExisting([candidate]))
    .filter((candidate): candidate is string => Boolean(candidate));

  const envRootSingle = resolveSingleCandidate(cwd, process.env.ECO_ASSETS_ROOT);

  const packagedRoot = resolveFirstExisting([
    path.resolve(__dirname, "assets"),
    path.resolve(__dirname, "../assets"),
    path.join(cwd, "dist", "assets"),
    path.join(cwd, "server", "dist", "assets"),
  ]);

  const legacyRoot = resolveFirstExisting([
    path.join(cwd, "assets"),
    path.resolve(__dirname, "../../assets"),
  ]);

  if (
    legacyRoot &&
    legacyRoot !== workspaceRoot &&
    legacyRoot !== packagedRoot &&
    (mode !== "production" || !packagedRoot)
  ) {
    log.warn("[ModuleStore.bootstrap] legacy_assets_detected", { legacyRoot });
  }

  const selectedRoot =
    mode === "production"
      ? packagedRoot
      : envRootSingle ?? workspaceRoot ?? packagedRoot ?? null;

  const roots = envRoots.length ? uniqueRoots(envRoots) : uniqueRoots(selectedRoot ? [selectedRoot] : []);

  log.info("[ModuleStore.bootstrap] asset_roots_detected", {
    mode,
    packagedRoot,
    workspaceRoot,
    envRoot: envRootSingle,
    envOverride: envRoots.length > 0,
    selectedRoot,
  });

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
    selectedRoot,
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
