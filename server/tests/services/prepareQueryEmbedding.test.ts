import assert from "node:assert/strict";

import { prepareQueryEmbedding } from "../../services/prepareQueryEmbedding";
import * as embeddingService from "../../adapters/embeddingService";

interface TestCase {
  name: string;
  run: () => Promise<void> | void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

test("normalizes direct user embeddings", async () => {
  const result = await prepareQueryEmbedding({ userEmbedding: [3, 4] });
  assert.ok(result, "embedding should be returned");
  const norm = Math.hypot(...result!);
  assert.ok(Math.abs(norm - 1) < 1e-9, "result should be unit length");
  assert.ok(Math.abs(result![0] / result![1] - 0.75) < 1e-12);
});

test("accepts stringified embeddings", async () => {
  const result = await prepareQueryEmbedding({ userEmbedding: "[1, 2, 2]" });
  assert.ok(result);
  assert.equal(result!.length, 3);
  assert.ok(Math.abs(Math.hypot(...result!) - 1) < 1e-9);
});

test("delegates to embedTextoCompleto with tag", async () => {
  const calls: Array<{ texto: string; tag: string | undefined }> = [];
  const original = embeddingService.embedTextoCompleto;
  (embeddingService as any).embedTextoCompleto = async (texto: string, tag?: string) => {
    calls.push({ texto, tag });
    return [0, 3, 4];
  };

  try {
    const result = await prepareQueryEmbedding({ texto: "  ola eco  ", tag: "refs" });
    assert.ok(result);
    assert.ok(Math.abs(Math.hypot(...result!) - 1) < 1e-9);
    assert.deepEqual(calls, [{ texto: "ola eco", tag: "refs" }]);
  } finally {
    (embeddingService as any).embedTextoCompleto = original;
  }
});

test("returns null on invalid embeddings", async () => {
  const original = embeddingService.embedTextoCompleto;
  (embeddingService as any).embedTextoCompleto = async () => [1, Number.NaN];
  try {
    const result = await prepareQueryEmbedding({ texto: "texto" });
    assert.equal(result, null);
  } finally {
    (embeddingService as any).embedTextoCompleto = original;
  }
});

(async () => {
  let failures = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      console.log(`✓ ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    console.error(`${failures} test(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`All ${tests.length} test(s) passed.`);
  }
})();
