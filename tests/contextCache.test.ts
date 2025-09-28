import assert from "node:assert/strict";
import { ContextCache, type ContextCacheParams } from "../server/services/conversation/contextCache";

interface TestCase {
  name: string;
  run: () => Promise<void> | void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

function createContextCache() {
  const store = new Map<string, any>();
  const builds: ContextCacheParams[] = [];

  const cache = {
    get: (key: string) => store.get(key),
    set: (key: string, value: any) => {
      store.set(key, value);
    },
  };

  const builder = {
    build: async (params: ContextCacheParams) => {
      builds.push(params);
      return { builtFrom: params, call: builds.length };
    },
  };

  const logger = {
    debug: () => {},
  };

  const contextCache = new ContextCache({
    cache: cache as any,
    builder: builder as any,
    logger: logger as any,
    debug: () => false,
  });

  return { contextCache, builds };
}

const baseParams: ContextCacheParams = {
  texto: "oi Eco",
  mems: [],
  memoriasSemelhantes: [],
  forcarMetodoViva: false,
  heuristicas: [],
  userEmbedding: [],
};

test("reuses cached context when inputs are unchanged", async () => {
  const { contextCache, builds } = createContextCache();

  const first = await contextCache.build(baseParams);
  const second = await contextCache.build(baseParams);

  assert.equal(builds.length, 1, "builder should only be invoked once for identical inputs");
  assert.deepEqual(second, first, "cached value should be reused");
});

test("changing forcarMetodoViva busts the cache", async () => {
  const { contextCache, builds } = createContextCache();

  await contextCache.build(baseParams);
  assert.equal(builds.length, 1);

  await contextCache.build({ ...baseParams, forcarMetodoViva: true });
  assert.equal(
    builds.length,
    2,
    "builder should run again when forcarMetodoViva flag changes"
  );
});

test("adding derivados or aberturaHibrida busts the cache", async () => {
  const { contextCache, builds } = createContextCache();

  await contextCache.build(baseParams);
  assert.equal(builds.length, 1);

  await contextCache.build({ ...baseParams, derivados: { resumo: "x" } });
  assert.equal(builds.length, 2, "builder should run for novos derivados");

  await contextCache.build({
    ...baseParams,
    derivados: { resumo: "x" },
    aberturaHibrida: { resumo: "y" },
  });
  assert.equal(
    builds.length,
    3,
    "builder should run again when aberturaHibrida presence changes",
  );
});

test("heuristicas presence participates in cache key", async () => {
  const { contextCache, builds } = createContextCache();

  await contextCache.build(baseParams);
  assert.equal(builds.length, 1);

  await contextCache.build({ ...baseParams, heuristicas: ["ancora"] });
  assert.equal(builds.length, 2, "builder should run when heuristicas become available");

  await contextCache.build({ ...baseParams, heuristicas: ["ancora"] });
  assert.equal(builds.length, 2, "builder should not run again for identical heuristicas flag");
});

test("user embedding presence participates in cache key", async () => {
  const { contextCache, builds } = createContextCache();

  await contextCache.build(baseParams);
  assert.equal(builds.length, 1);

  await contextCache.build({ ...baseParams, userEmbedding: [0.1, 0.2] });
  assert.equal(builds.length, 2, "builder should run when embedding is supplied");

  await contextCache.build({ ...baseParams, userEmbedding: [0.1, 0.2] });
  assert.equal(builds.length, 2, "builder should reuse cached embedding context");
});

test("full-lane style parameters still reuse cache when unchanged", async () => {
  const { contextCache, builds } = createContextCache();

  const fullLaneParams: ContextCacheParams = {
    ...baseParams,
    forcarMetodoViva: true,
    derivados: { temas: [] },
    aberturaHibrida: { sugestao: "insight" },
    heuristicas: ["ancora"],
    userEmbedding: [0.12, 0.34],
  };

  const first = await contextCache.build(fullLaneParams);
  const second = await contextCache.build(fullLaneParams);

  assert.equal(
    builds.length,
    1,
    "builder should be called only once for identical full-lane inputs",
  );
  assert.deepEqual(second, first, "cached value should be reused for full-lane context");
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
