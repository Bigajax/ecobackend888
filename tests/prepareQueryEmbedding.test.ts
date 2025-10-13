import assert from "node:assert/strict";

import {
  coerceToNumberArray,
  prepareQueryEmbedding,
} from "../server/services/prepareQueryEmbedding";
import { MAX_EMBEDDING_VECTOR_LENGTH } from "../server/adapters/embeddingService";

interface TestCase {
  name: string;
  run: () => Promise<void> | void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

test("coerceToNumberArray rejeita vetores gigantes", () => {
  const huge = Array(MAX_EMBEDDING_VECTOR_LENGTH + 1).fill(0);
  assert.equal(coerceToNumberArray(huge), null);
});

test("prepareQueryEmbedding ignora embeddings de usuário muito grandes", async () => {
  const huge = Array(MAX_EMBEDDING_VECTOR_LENGTH + 1).fill(0.1);
  const result = await prepareQueryEmbedding({ userEmbedding: huge });
  assert.equal(result, null);
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
