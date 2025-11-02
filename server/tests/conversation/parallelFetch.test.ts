import test from "node:test";
import assert from "node:assert";

import { ParallelFetchService, withTimeoutOrNull } from "../../services/conversation/parallelFetch";

test("retorna resultados vazios quando embedding falha", async () => {
  const service = new ParallelFetchService({
    getEmbedding: async () => {
      throw new Error("embedding failed");
    },
    getHeuristicas: async () => ["h1"] as any,
    getMemorias: async () => ["m1"] as any,
    logger: { warn: () => {}, info: () => {} } as any,
    debug: () => false,
  });

  const result = await service.run({ ultimaMsg: "test" });

  assert.deepStrictEqual(result.userEmbedding, []);
  assert.deepStrictEqual(result.heuristicas, []);
  assert.deepStrictEqual(result.memsSemelhantes, []);
});

test("usa cache de heurísticas quando RPC primário falha", async () => {
  const logger: any = { warn: () => {}, info: () => {} };
  const service = new ParallelFetchService({
    getEmbedding: async () => [0.1, 0.2, 0.3],
    getHeuristicas: async () => {
      throw new Error("RPC failed");
    },
    getMemorias: async () => ["m1"] as any,
    logger,
    debug: () => false,
  });

  // Prime cache
  service["heuristicaCache"].set("user1", ["h-cached"]);

  const result = await service.run({ ultimaMsg: "test", userId: "user1" });
  assert.deepStrictEqual(result.heuristicas, ["h-cached"]);
  assert.deepStrictEqual(result.memsSemelhantes, ["m1"]);
});

test("usa cache de memórias quando RPC primário falha", async () => {
  const service = new ParallelFetchService({
    getEmbedding: async () => [0.1, 0.2, 0.3],
    getHeuristicas: async () => ["h1"] as any,
    getMemorias: async () => {
      throw new Error("RPC failed");
    },
    logger: { warn: () => {}, info: () => {} } as any,
    debug: () => false,
  });

  // Prime cache
  service["memoriaCache"].set("user1", ["m-cached"]);

  const result = await service.run({ ultimaMsg: "test", userId: "user1" });

  assert.deepStrictEqual(result.heuristicas, ["h1"]);
  assert.deepStrictEqual(result.memsSemelhantes, ["m-cached"]);
});

test("ignora promise de memórias para usuário anônimo", async () => {
  const getMemorias = test.mock.fn(async () => ["m1"]);
  const service = new ParallelFetchService({
    getEmbedding: async () => [0.1, 0.2, 0.3],
    getHeuristicas: async () => ["h1"] as any,
    getMemorias: getMemorias as any,
    logger: { warn: () => {}, info: () => {} } as any,
    debug: () => false,
  });

  const result = await service.run({ ultimaMsg: "test", userId: undefined });
  assert.strictEqual(getMemorias.mock.calls.length, 0);
  assert.deepStrictEqual(result.memsSemelhantes, []);
});

test("withTimeoutOrNull retorna null em caso de timeout", async () => {
  const slowPromise = new Promise((resolve) => setTimeout(() => resolve("done"), 20));
  const result = await withTimeoutOrNull(slowPromise, 10, "test", { logger: { warn: () => {} } as any });
  assert.strictEqual(result, null);
});
