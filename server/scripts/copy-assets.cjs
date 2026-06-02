#!/usr/bin/env node
const path = require("path");
const fs = require("fs-extra");

const REQUIRED_FILES = [
  {
    relative: path.join("modulos_core", "developer_prompt.txt"),
    placeholder:
      "Placeholder developer prompt. Atualize este arquivo com o conteúdo oficial para ativar o módulo de desenvolvedor.",
  },
  {
    relative: path.join("modulos_core", "usomemorias.txt"),
    placeholder:
      "Placeholder uso de memórias. Preencha com instruções reais para liberar o módulo de memórias.",
  },
];

async function ensureRequiredFiles(sourceDir) {
  for (const file of REQUIRED_FILES) {
    const absolute = path.join(sourceDir, file.relative);
    const exists = await fs.pathExists(absolute);
    if (exists) continue;
    await fs.ensureDir(path.dirname(absolute));
    await fs.writeFile(absolute, file.placeholder, "utf8");
    console.warn("[copy-assets] placeholder_created", { file: absolute });
  }
}

async function countFiles(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await countFiles(full);
    } else {
      total += 1;
    }
  }
  return total;
}

async function copyRecursive(sourceDir, targetDir) {
  await fs.ensureDir(path.dirname(targetDir));
  await fs.rm(targetDir, { force: true, recursive: true });
  await fs.copy(sourceDir, targetDir, {
    overwrite: true,
    errorOnExist: false,
  });
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const sourceDir = path.join(projectRoot, "assets");
  const targetDir = path.join(projectRoot, "dist", "assets");

  console.info("[copy-assets] start", { sourceDir, targetDir });

  const exists = await fs.pathExists(sourceDir);
  if (!exists) {
    console.error("[copy-assets] source_missing", { sourceDir });
    process.exitCode = 1;
    return;
  }

  await ensureRequiredFiles(sourceDir);

  try {
    await copyRecursive(sourceDir, targetDir);
    const manifestName = "modules.manifest.json";
    const manifestSource = path.join(sourceDir, manifestName);
    const manifestTarget = path.join(targetDir, manifestName);
    const manifestExists = await fs.pathExists(manifestSource);
    if (!manifestExists) {
      console.warn("[copy-assets] manifest_missing_source", { manifest: manifestSource });
    } else {
      const manifestCopied = await fs.pathExists(manifestTarget);
      if (!manifestCopied) {
        console.error("[copy-assets] manifest_copy_failed", {
          source: manifestSource,
          target: manifestTarget,
        });
        process.exitCode = 1;
        return;
      }
    }
    const filesCopied = await countFiles(targetDir);
    console.info("[copy-assets] completed", {
      sourceDir,
      targetDir,
      filesCopied,
    });
  } catch (error) {
    console.error("[copy-assets] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

void main();
