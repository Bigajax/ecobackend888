import test from "node:test";
import assert from "node:assert";

process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";

type ParallelFetchResult = import("../../services/conversation/parallelFetch").ParallelFetchResult;
const { ParallelFetchService } = require("../../services/conversation/parallelFetch") as typeof import("../../services/conversation/parallelFetch");

const fakeEmbedding = [0.1, 0.2, 0.3];

function createDeps() {
  const calls: Record<string, unknown[]> = {
    getEmbedding: [],
    getHeuristicas: [],
    getMemorias: [],
  };

  const deps = {
    getEmbedding: async (texto: string, tipo: string) => {
      calls.getEmbedding.push([texto, tipo]);
      return fakeEmbedding;
    },
    getHeuristicas: async (params: any) => {
      calls.getHeuristicas.push(params);
      return ["heuristica"];
    },
    getMemorias: async (userId: string, params: any) => {
      calls.getMemorias.push([userId, params]);
      return ["mem" as any];
    },
    logger: {
      warn: () => undefined,
    },
    debug: () => true,
  } as const;

  const service = new ParallelFetchService(deps as any);
  return { service, calls };
}

test("gera embedding apenas quando há mensagem relevante", async () => {
  const { service, calls } = createDeps();
  const res = await service.run({ ultimaMsg: "   ", userId: "user" });

  assert.deepStrictEqual(res, {
    heuristicas: [],
    memsSemelhantes: [],
    userEmbedding: [],
  } satisfies ParallelFetchResult);
  assert.strictEqual(calls.getEmbedding.length, 0);
  assert.strictEqual(calls.getHeuristicas.length, 0);
  assert.strictEqual(calls.getMemorias.length, 0);
});

test("encaminha embedding para heurísticas e memórias quando disponível", async () => {
  const { service, calls } = createDeps();

  const res = await service.run({
    ultimaMsg: "quero entender meus padrões",
    userId: "user-123",
    supabase: { tag: "db" },
  });

  assert.deepStrictEqual(res.heuristicas, ["heuristica"]);
  assert.deepStrictEqual(res.memsSemelhantes, ["mem"]);
  assert.deepStrictEqual(res.userEmbedding, fakeEmbedding);

  assert.deepStrictEqual(calls.getEmbedding[0], ["quero entender meus padrões", "entrada_usuario"]);
  assert.deepStrictEqual(calls.getHeuristicas[0], {
    usuarioId: "user-123",
    userEmbedding: fakeEmbedding,
    matchCount: 5,
  });
  assert.deepStrictEqual(calls.getMemorias[0], ["user-123", {
    texto: "quero entender meus padrões",
    k: 3,
    threshold: 0.12,
    supabaseClient: { tag: "db" },
  }]);
});

test("ignora busca de memórias quando usuário indefinido", async () => {
  const { service, calls } = createDeps();

  const res = await service.run({ ultimaMsg: "texto", userId: undefined });

  assert.deepStrictEqual(res.memsSemelhantes, []);
  assert.strictEqual(calls.getMemorias.length, 0);
});

