import path from "node:path";
import process from "node:process";

import {
  ensureModuleManifest,
  moduleManifest,
  listManifestModulesByFamily,
} from "../services/promptContext/moduleManifest";

interface CliOptions {
  dump: boolean;
  json: boolean;
}

interface FamilySummary {
  id: string;
  rewardKey: string | null;
  baseline: string | null;
  enabled: boolean;
  enabledArms: Array<{ id: string; role: string; size: string; tokensAvg: number }>;
  disabledArms: Array<{ id: string; role: string; size: string; tokensAvg: number }>;
}

function parseArgs(argv: string[]): CliOptions {
  const dump = argv.includes("--dump-modules") || argv.includes("--dump") || argv.length === 0;
  const json = argv.includes("--json");
  return { dump, json };
}

async function main(): Promise<void> {
  const { dump, json } = parseArgs(process.argv.slice(2));

  await ensureModuleManifest();
  const description = moduleManifest.describe();

  if (!description.path) {
    console.error("[modulesInventory] Nenhum manifesto encontrado. Esperado em server/assets/modules.manifest.json");
    process.exitCode = 1;
    return;
  }

  const manifestPath = path.relative(process.cwd(), description.path);
  const defaults = description.defaults;

  const families: FamilySummary[] = description.families.map((family) => {
    const manifestArms = listManifestModulesByFamily(family.id);
    const enabledArms: FamilySummary["enabledArms"] = [];
    const disabledArms: FamilySummary["disabledArms"] = [];

    for (const arm of manifestArms) {
      const target = arm.enabled === false ? disabledArms : enabledArms;
      target.push({
        id: arm.id,
        role: arm.role,
        size: arm.size,
        tokensAvg: Number.isFinite(arm.tokens_avg) ? Number(arm.tokens_avg) : 0,
      });
    }

    enabledArms.sort((a, b) => a.id.localeCompare(b.id));
    disabledArms.sort((a, b) => a.id.localeCompare(b.id));

    return {
      id: family.id,
      rewardKey: family.rewardKey ?? null,
      baseline: family.baseline ?? null,
      enabled: family.enabled !== false,
      enabledArms,
      disabledArms,
    };
  });

  const failures = families
    .filter((family) => family.enabled)
    .filter((family) => family.enabledArms.length === 0)
    .map((family) => family.id);

  if (json) {
    const payload = {
      manifest: {
        path: manifestPath,
        version: description.version ?? null,
        defaults,
      },
      families,
      failures,
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exitCode = failures.length ? 1 : 0;
    return;
  }

  if (dump) {
    console.log(`Manifesto: ${manifestPath}`);
    console.log(
      `Versão: ${description.version ?? "(sem versão)"} | janela=${defaults.windowDays}d | α=${defaults.alphaPrior} | β=${defaults.betaPrior} | max_aux_tokens=${defaults.maxAuxTokens}`
    );
    console.log("");
    for (const family of families) {
      const header = `Família ${family.id} (${family.rewardKey ?? "sem_reward"})`;
      const status = family.enabled ? "ativa" : "desativada";
      console.log(`${header} → baseline=${family.baseline ?? "(não definido)"} | ${status}`);
      const enabledList = family.enabledArms
        .map((arm) => `${arm.id} [${arm.role}/${arm.size}/${arm.tokensAvg}]`)
        .join(", ");
      console.log(`  Arms habilitados (${family.enabledArms.length}): ${enabledList || "nenhum"}`);
      if (family.disabledArms.length) {
        const disabledList = family.disabledArms
          .map((arm) => `${arm.id} [${arm.role}/${arm.size}/${arm.tokensAvg}]`)
          .join(", ");
        console.log(`  Arms desativados (${family.disabledArms.length}): ${disabledList}`);
      }
      console.log("");
    }
  }

  if (failures.length) {
    console.error(`Famílias sem arms habilitados: ${failures.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log("[modulesInventory] Todas as famílias possuem arms habilitados.");
}

main().catch((error) => {
  console.error("[modulesInventory] Falha inesperada:", error);
  process.exitCode = 1;
});
