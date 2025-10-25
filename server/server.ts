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

const app = createApp();

const REQUIRED_MODULE_PATHS = [
  "modulos_core/developer_prompt.txt",
  "modulos_core/nv1_core.txt",
  "modulos_core/identidade_mini.txt",
  "modulos_extras/escala_abertura_1a3.txt",
  "modulos_core/eco_estrutura_de_resposta.txt",
  "modulos_core/usomemorias.txt",
  "modulos_extras/bloco_tecnico_memoria.txt",
  "modulos_extras/metodo_viva_enxuto.txt",
] as const;

type RootCandidate = { label: string; path: string; exists: boolean };

function resolveRoot(label: string, candidates: string[]): RootCandidate {
  for (const candidate of candidates) {
    try {
      const stats = fs.statSync(candidate);
      if (stats.isDirectory()) {
        return { label, path: candidate, exists: true };
      }
    } catch {
      // ignore and try next candidate
    }
  }
  return { label, path: candidates[0], exists: false };
}

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
  const RUNNING_FROM_DIST = __dirname.split(path.sep).includes("dist");

  const distCandidates = [
    path.resolve(process.cwd(), "dist", "assets"),
    path.resolve(process.cwd(), "server", "dist", "assets"),
  ];
  if (RUNNING_FROM_DIST) {
    distCandidates.push(path.resolve(__dirname, "assets"));
    distCandidates.push(path.resolve(__dirname, "../assets"));
  }

  const workspaceCandidates = [path.resolve(process.cwd(), "server", "assets")];
  if (!RUNNING_FROM_DIST) {
    workspaceCandidates.push(path.resolve(__dirname, "assets"));
    workspaceCandidates.push(path.resolve(__dirname, "../assets"));
  }

  const distRoot = resolveRoot("dist/assets", distCandidates);
  const workspaceRoot = resolveRoot("server/assets", workspaceCandidates);

  if (fs.existsSync(path.resolve(process.cwd(), "assets"))) {
    console.warn("[boot] legacy_assets_detected", { legacyRoot: path.resolve(process.cwd(), "assets") });
  }

  const distFiles = distRoot.exists ? countFilesSync(distRoot.path) : 0;
  console.info("[boot] assets_files_count", {
    root: distRoot.path,
    exists: distRoot.exists,
    files: distFiles,
  });
  if (distFiles <= 0) {
    console.error("[boot] dist_assets_empty", { root: distRoot.path, exists: distRoot.exists });
    process.exit(1);
  }

  const roots = distRoot.exists
    ? [distRoot]
    : workspaceRoot.exists
    ? [workspaceRoot]
    : [];

  if (distRoot.exists && workspaceRoot.exists) {
    console.warn("[boot] multiple_asset_roots", { using: distRoot.path, ignored: workspaceRoot.path });
  }

  const missing: Array<{ file: string; root: string; fullPath: string }> = [];

  for (const relativeFile of REQUIRED_MODULE_PATHS) {
    for (const root of roots) {
      const fullPath = path.join(root.path, relativeFile);
      if (!fs.existsSync(fullPath)) {
        missing.push({ file: relativeFile, root: root.label, fullPath });
      }
    }
  }

  if (missing.length > 0) {
    for (const entry of missing) {
      console.error("[boot] required_module_missing", entry);
    }
    process.exit(1);
  }

  for (const relativeFile of REQUIRED_MODULE_PATHS) {
    let hadContent = false;
    let bytes = 0;

    const primaryRoot = roots[0];
    if (primaryRoot && fs.existsSync(primaryRoot.path)) {
      try {
        const content = fs.readFileSync(path.join(primaryRoot.path, relativeFile), "utf-8");
        bytes = Buffer.byteLength(content, "utf-8");
        hadContent = content.trim().length > 0;
      } catch (error) {
        console.error("[boot] required_module_read_failed", {
          file: relativeFile,
          root: primaryRoot.label,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.info("[boot] required_module_ok", {
      file: relativeFile,
      roots: roots.map((root) => path.join(root.path, relativeFile)),
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

process.on("unhandledRejection", (reason) => {
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
