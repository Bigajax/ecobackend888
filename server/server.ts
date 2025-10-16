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
import { getStaticCorsWhitelist } from "./middleware/cors";
import { configureModuleStore } from "./bootstrap/modules";
import registrarTodasHeuristicas from "./services/registrarTodasHeuristicas";
import registrarModulosFilosoficos from "./services/registrarModulosFilosoficos";
import { log } from "./services/promptContext/logger";
import { startBanditRewardSyncScheduler } from "./services/banditRewardsSync";
import { analyticsClientMode } from "./services/supabaseClient";

const app = createApp();

async function start() {
  await configureModuleStore();
  startBanditRewardSyncScheduler();

  const PORT = Number(process.env.PORT || 3001);
  app.listen(PORT, async () => {
    log.info(`Servidor Express rodando na porta ${PORT}`);
    log.info("CORS allowlist (static):", getStaticCorsWhitelist().join(", "));
    log.info("CORS preview pattern:", ".vercel.app");
    log.info("Boot", {
      ECO_LOG_LEVEL: process.env.ECO_LOG_LEVEL ?? "(unset)",
      ECO_DEBUG: process.env.ECO_DEBUG ?? "(unset)",
      NODE_ENV: process.env.NODE_ENV ?? "(unset)",
      analyticsClientMode,
    });

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
