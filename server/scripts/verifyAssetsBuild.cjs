#!/usr/bin/env node
const path = require("path");
const fs = require("fs");

function listTsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function ensureJsCounterpart(serverRoot, tsFile) {
  const rel = path.relative(path.join(serverRoot, "assets", "config"), tsFile);
  const target = path.join(serverRoot, "dist", "assets", "config", rel.replace(/\.ts$/, ".js"));
  return fs.existsSync(target) ? null : target;
}

function main() {
  const serverRoot = path.resolve(__dirname, "..");
  const assetsConfigRoot = path.join(serverRoot, "assets", "config");
  const tsFiles = listTsFiles(assetsConfigRoot);
  const missing = tsFiles
    .map((file) => ensureJsCounterpart(serverRoot, file))
    .filter((target) => target != null);

  if (missing.length > 0) {
    console.error("[verify:assets] missing_js_counterparts", { missing });
    process.exit(1);
  }

  console.info("[verify:assets] ok", { checked: tsFiles.length });
}

main();
