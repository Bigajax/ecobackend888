import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { promises as fs } from "fs";
import * as path from "path";

import { ModuleStore } from "../../services/promptContext/ModuleStore";

const distRoot = path.resolve(process.cwd(), "dist/assets");
const fallbackRoot = path.resolve(process.cwd(), "server/assets");

const originalAssetsRoot = process.env.ECO_ASSETS_ROOT;
const originalPromptRoots = process.env.ECO_PROMPT_ROOTS;

const createdFiles: string[] = [];

async function createTestFile(root: string, filename: string, content: string) {
  const full = path.join(root, filename);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
  createdFiles.push(full);
  return full;
}

async function removeCreatedFiles() {
  await Promise.all(
    createdFiles.map(async (file) => {
      await fs.rm(file, { force: true });
    })
  );
  createdFiles.length = 0;
}

function restoreEnv() {
  if (originalAssetsRoot == null) {
    delete process.env.ECO_ASSETS_ROOT;
  } else {
    process.env.ECO_ASSETS_ROOT = originalAssetsRoot;
  }
  if (originalPromptRoots == null) {
    delete process.env.ECO_PROMPT_ROOTS;
  } else {
    process.env.ECO_PROMPT_ROOTS = originalPromptRoots;
  }
}

beforeEach(async () => {
  restoreEnv();
  ModuleStore.configure([]);
  ModuleStore.invalidate();
  await removeCreatedFiles();
});

afterEach(async () => {
  ModuleStore.configure([]);
  ModuleStore.invalidate();
  await removeCreatedFiles();
  restoreEnv();
});

test("serve arquivo presente no dist/assets", async () => {
  const filename = `module_store_dist_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`;
  const content = "conteudo dist";
  await createTestFile(distRoot, filename, content);

  process.env.ECO_ASSETS_ROOT = distRoot;
  ModuleStore.configure([]);
  ModuleStore.invalidate();

  const result = await ModuleStore.read(filename);
  assert.strictEqual(result, content);
});

test("faz fallback para server/assets quando arquivo não está no dist", async () => {
  const filename = `module_store_fallback_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`;
  const content = "conteudo fallback";
  await createTestFile(fallbackRoot, filename, content);

  process.env.ECO_ASSETS_ROOT = distRoot;
  ModuleStore.configure([]);
  ModuleStore.invalidate();

  const result = await ModuleStore.read(filename);
  assert.strictEqual(result, content);
});

test("usa server/assets quando ECO_ASSETS_ROOT aponta para ele", async () => {
  const filename = `module_store_env_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`;
  const content = "conteudo assets";
  await createTestFile(fallbackRoot, filename, content);

  process.env.ECO_ASSETS_ROOT = fallbackRoot;
  ModuleStore.configure([]);
  ModuleStore.invalidate();

  const result = await ModuleStore.read(filename);
  assert.strictEqual(result, content);
});
