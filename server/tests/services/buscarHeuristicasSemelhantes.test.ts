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

test("buscarHeuristicasSemelhantes normalizes embeddings before RPC", async () => {
  ensureSupabaseEnv();
  const [heuristicaService, supabaseModule] = await Promise.all([
    import("../../services/heuristicaService"),
    import("../../lib/supabaseAdmin"),
  ]);

  const supabase = supabaseModule.supabase ?? supabaseModule.default;
  const calls: Array<{ fn: string; params: Record<string, any> }> = [];
  const originalRpc = supabase.rpc.bind(supabase);
  (supabase as any).rpc = async (fn: string, params: Record<string, any>) => {
    calls.push({ fn, params });
    return {
      data: [
        {
          id: "heur-1",
          similarity: 0.88,
        },
      ],
      error: null,
    };
  };

  try {
    const resultado = await heuristicaService.buscarHeuristicasSemelhantes({
      userEmbedding: [3, 4],
      hydrate: false,
      usuarioId: "user-2",
    });

    assert.equal(calls.length, 1);
    const embedding = calls[0].params.query_embedding as number[];
    assert.ok(Math.abs(Math.hypot(...embedding) - 1) < 1e-9);
    assert.ok(Math.abs(embedding[0] - 0.6) < 1e-12);
    assert.ok(Math.abs(embedding[1] - 0.8) < 1e-12);
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0]?.id, "heur-1");
  } finally {
    (supabase as any).rpc = originalRpc;
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
