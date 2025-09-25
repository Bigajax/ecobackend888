import path from "path";
import fs from "fs";
import ModuleStore from "../services/promptContext/ModuleStore";
import { log } from "../services/promptContext/logger";

function dirIfExists(p: string) {
  try { return fs.statSync(p).isDirectory() ? p : null; } catch { return null; }
}

export async function configureModuleStore() {
  const CWD = process.cwd();

  // dev (ts-node) — tua estrutura real
  const devRoots = [
    path.join(CWD, "server", "assets", "modulos_core"),
    path.join(CWD, "server", "assets", "modulos_cognitivos"),
    path.join(CWD, "server", "assets", "modulos_emocionais"),
    path.join(CWD, "server", "assets", "modulos_extras"),
    path.join(CWD, "server", "assets", "modulos_filosoficos")
  ].map(dirIfExists).filter(Boolean) as string[];

  // prod (tsc) — copiamos para dist/server/assets com o script copy:assets
  const distRoots = [
    path.join(CWD, "dist", "server", "assets", "modulos_core"),
    path.join(CWD, "dist", "server", "assets", "modulos_cognitivos"),
    path.join(CWD, "dist", "server", "assets", "modulos_emocionais"),
    path.join(CWD, "dist", "server", "assets", "modulos_extras"),
    path.join(CWD, "dist", "server", "assets", "modulos_filosoficos")
  ].map(dirIfExists).filter(Boolean) as string[];

  // prioriza dist em produção, mantém dev como fallback
  const roots = [...distRoots, ...devRoots];

  ModuleStore.configure(roots);
  await ModuleStore.buildFileIndexOnce();

  log.info("[ModuleStore.bootstrap] configurado", {
    roots,
    indexedCount: (ModuleStore as any).I["fileIndex"]?.size ?? 0
  });
}
