#!/usr/bin/env node
const path = require("path");
const fs = require("fs-extra");

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

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const sourceDir = path.join(projectRoot, "assets");
  const targetDir = path.join(projectRoot, "dist", "assets");

  const legacyDir = path.resolve(projectRoot, "..", "assets");
  if (await fs.pathExists(legacyDir)) {
    console.warn("[copy:assets] legacy_root_ignored", { legacyDir });
  }

  const exists = await fs.pathExists(sourceDir);
  if (!exists) {
    console.warn("[copy:assets] source_missing", { sourceDir });
    return;
  }

  try {
    await fs.ensureDir(path.dirname(targetDir));
    await fs.rm(targetDir, { force: true, recursive: true });
    await fs.copy(sourceDir, targetDir, {
      overwrite: true,
      errorOnExist: false,
      filter: (src) => !src.endsWith(".ts"),
    });

    const filesCopied = await countFiles(targetDir);
    console.info("[copy:assets] completed", {
      sourceDir,
      targetDir,
      filesCopied,
    });
  } catch (error) {
    console.error("[copy:assets] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

void main();
