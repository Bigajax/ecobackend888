import path from "path";
import fs from "fs";
import { ModuleCatalog } from "../domains/prompts/ModuleCatalog";
import { log } from "../services/promptContext/logger";

function dirIfExists(p: string) {
  try {
    return fs.statSync(p).isDirectory() ? p : null;
  } catch {
    return null;
  }
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
    .filter(Boolean) as string[];

  // 2) DEV: suportar tanto server/assets quanto assets (raiz)
  const devRootsServer = [
    path.join(CWD, "server", "assets", "modulos_core"),
    path.join(CWD, "server", "assets", "modulos_cognitivos"),
    path.join(CWD, "server", "assets", "modulos_emocionais"),
    path.join(CWD, "server", "assets", "modulos_extras"),
    path.join(CWD, "server", "assets", "modulos_filosoficos"),
  ].map(dirIfExists).filter(Boolean) as string[];

  const devRootsRoot = [
    path.join(CWD, "assets", "modulos_core"),
    path.join(CWD, "assets", "modulos_cognitivos"),
    path.join(CWD, "assets", "modulos_emocionais"),
    path.join(CWD, "assets", "modulos_extras"),
    path.join(CWD, "assets", "modulos_filosoficos"),
  ].map(dirIfExists).filter(Boolean) as string[];

  // 3) PROD: o script copy:assets envia para dist/assets/...
  const distRoots = [
    path.join(CWD, "dist", "assets", "modulos_core"),
    path.join(CWD, "dist", "assets", "modulos_cognitivos"),
    path.join(CWD, "dist", "assets", "modulos_emocionais"),
    path.join(CWD, "dist", "assets", "modulos_extras"),
    path.join(CWD, "dist", "assets", "modulos_filosoficos"),
  ].map(dirIfExists).filter(Boolean) as string[];

  // Prioridade: env → dist → dev(server) → dev(root)
  const roots = [...envRoots, ...distRoots, ...devRootsServer, ...devRootsRoot];

  ModuleCatalog.configure(roots);
  await ModuleCatalog.buildFileIndexOnce();

  log.info("[ModuleStore.bootstrap] configurado", {
    roots,
    // mostra até 10 itens só pra sinalizar que indexou
    indexedPeek: ModuleCatalog.listIndexed(10),
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
