import path from "path";
import fs from "fs";
import dotenv from "dotenv";

(function loadEnv() {
  const explicit = process.env.DOTENV_PATH;
  if (explicit && fs.existsSync(explicit)) {
    dotenv.config({ path: explicit });
    return;
  }
  const tryPaths = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const p of tryPaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }
})();

import { createApp } from "./core/http/app";
import { getConfiguredCorsOrigins } from "./middleware/cors";
import { configureModuleStore } from "./bootstrap/modules";
import { ModuleCatalog } from "./domains/prompts/ModuleCatalog";
import registrarTodasHeuristicas from "./services/registrarTodasHeuristicas";
import registrarModulosFilosoficos from "./services/registrarModulosFilosoficos";
import { log } from "./services/promptContext/logger";
import { startBanditRewardSyncScheduler } from "./services/banditRewardsSync";
import { analyticsClientMode } from "./services/supabaseClient";
import { ensureEcoIdentityPromptAvailability } from "./services/promptContext/identityModules";
import { describeAssetsRoot } from "./src/utils/assetsRoot";

const app = createApp();

const REQUIRED_MODULE_PATHS = [
  "modulos_core/developer_prompt.txt",
  "modulos_core/abertura_superficie.txt",
  "modulos_core/sistema_identidade.txt",
  "modulos_extras/escala_abertura_1a3.txt",
  "modulos_core/formato_resposta.txt",
  "modulos_core/usomemorias.txt",
  "modulos_core/tecnico_bloco_memoria.txt",
  "modulos_extras/metodo_viva_enxuto.txt",
] as const;

function countFilesSync(dir: string): number {
  let total = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += countFilesSync(full);
      } else {
        total += 1;
      }
    }
  } catch {
    return 0;
  }
  return total;
}

function assertRequiredModules() {
  const assetsInfo = describeAssetsRoot();
  const primaryRoot = path.resolve(assetsInfo.root);

  if (fs.existsSync(path.resolve(process.cwd(), "assets"))) {
    console.warn("[boot] legacy_assets_detected", { legacyRoot: path.resolve(process.cwd(), "assets") });
  }

  const rootExists = assetsInfo.exists && fs.existsSync(primaryRoot) && fs.statSync(primaryRoot).isDirectory();
  const filesCount = rootExists ? countFilesSync(primaryRoot) : 0;

  console.info("[boot] assets_root_resolved", {
    root: primaryRoot,
    exists: rootExists,
    files: filesCount,
  });

  if (!rootExists || filesCount <= 0) {
    console.error("[boot] assets_root_unavailable", {
      root: primaryRoot,
      exists: rootExists,
      files: filesCount,
    });
    process.exit(1);
  }

  const missing: Array<{ file: string; fullPath: string }> = [];

  for (const relativeFile of REQUIRED_MODULE_PATHS) {
    const fullPath = path.join(primaryRoot, relativeFile);
    if (!fs.existsSync(fullPath)) {
      missing.push({ file: relativeFile, fullPath });
    }
  }

  if (missing.length > 0) {
    for (const entry of missing) {
      console.error("[boot] required_module_missing", entry);
    }
    process.exit(1);
  }

  for (const relativeFile of REQUIRED_MODULE_PATHS) {
    const fullPath = path.join(primaryRoot, relativeFile);
    let hadContent = false;
    let bytes = 0;

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      bytes = Buffer.byteLength(content, "utf-8");
      hadContent = content.trim().length > 0;
    } catch (error) {
      console.error("[boot] required_module_read_failed", {
        file: relativeFile,
        root: primaryRoot,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    console.info("[boot] required_module_ok", {
      file: relativeFile,
      root: fullPath,
      hadContent,
      bytes,
    });
  }
}

async function start() {
  assertRequiredModules();
  await configureModuleStore();
  const moduleStats = ModuleCatalog.stats();
  if (moduleStats.indexedCount > 0) {
    console.info("[boot] module_index_ready", {
      roots: moduleStats.roots,
      indexedCount: moduleStats.indexedCount,
    });
  } else {
    console.error("[boot] module_index_empty", {
      roots: moduleStats.roots,
      indexedCount: moduleStats.indexedCount,
    });
  }
  await ensureEcoIdentityPromptAvailability();
  startBanditRewardSyncScheduler();

  const PORT = Number(process.env.PORT || 3001);
  app.listen(PORT, async () => {
    log.info(`Servidor Express rodando na porta ${PORT}`);
    log.info("CORS allowlist:", getConfiguredCorsOrigins());
    log.info("Boot", {
      ECO_LOG_LEVEL: process.env.ECO_LOG_LEVEL ?? "(unset)",
      ECO_DEBUG: process.env.ECO_DEBUG ?? "(unset)",
      NODE_ENV: process.env.NODE_ENV ?? "(unset)",
      analyticsClientMode,
    });
    console.info("[boot] paths", { cwd: process.cwd(), dirname: __dirname });

    try {
      if (process.env.REGISTRAR_HEURISTICAS === "true") {
        await registrarTodasHeuristicas();
        log.info("🎯 Heurísticas registradas.");
      }
      if (process.env.REGISTRAR_FILOSOFICOS === "true") {
        await registrarModulosFilosoficos();
        log.info("🧘 Módulos filosóficos registrados.");
      }
    } catch (error: any) {
      log.error("Falha ao registrar recursos iniciais:", { message: error?.message, stack: error?.stack });
    }
  });
}

process.on("unhandledRejection", (reason: any) => {
  if (reason?.message === "client_closed_early") {
    log.debug("[boot] swallowed unhandledRejection: client_closed_early");
    return;
  }
  log.error("unhandledRejection", { reason });
});
process.on("uncaughtException", (err) => {
  log.error("uncaughtException", { message: err.message, stack: err.stack });
});

start().catch((error) => {
  log.error("Falha no boot do servidor:", { message: error?.message, stack: error?.stack });
  process.exitCode = 1;
});

export default app;
