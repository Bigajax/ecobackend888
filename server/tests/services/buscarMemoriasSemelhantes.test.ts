import assert from "node:assert/strict";

const ensureSupabaseEnv = () => {
  process.env.SUPABASE_URL ??= "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";
};

interface TestCase {
  name: string;
  run: () => Promise<void> | void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

test("buscarMemoriasSemelhantes normalizes provided embeddings", async () => {
  ensureSupabaseEnv();
  const { buscarMemoriasSemelhantes } = await import("../../services/buscarMemorias");

  const calls: Array<{ fn: string; params: any }> = [];
  const fakeClient = {
    rpc: async (fn: string, params: Record<string, any>) => {
      calls.push({ fn, params });
      return {
        data: [
          {
            id: "mem-1",
            resumo_eco: "Resumo",
            similarity: 0.92,
          },
        ],
        error: null,
      };
    },
  };

  const resultado = await buscarMemoriasSemelhantes("user-1", {
    userEmbedding: [3, 4],
    k: 1,
    threshold: 0.5,
    supabaseClient: fakeClient as any,
  });

  assert.equal(calls.length, 1, "deveria chamar a RPC apenas uma vez");
  assert.equal(calls[0].fn, "buscar_memorias_semelhantes_v2_safe");
  const rpcArgs = calls[0].params as any[];
  assert.ok(Array.isArray(rpcArgs), "payload deve ser posicional");
  const embedding = rpcArgs[0] as number[];
  assert.equal(rpcArgs[1], "user-1");
  assert.equal(rpcArgs[2], 5);
  assert.equal(rpcArgs[3], 0.72);
  assert.equal(rpcArgs[4], 365);
  assert.ok(Math.abs(Math.hypot(...embedding) - 1) < 1e-9, "embedding deve ter norma 1");
  assert.ok(Math.abs(embedding[0] - 0.6) < 1e-12);
  assert.ok(Math.abs(embedding[1] - 0.8) < 1e-12);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0]?.id, "mem-1");
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
