import test from "node:test";
import assert from "node:assert";

process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";

type ParallelFetchResult = import("../../services/conversation/parallelFetch").ParallelFetchResult;
const { ParallelFetchService } = require("../../services/conversation/parallelFetch") as typeof import("../../services/conversation/parallelFetch");

const fakeEmbedding = [0.1, 0.2, 0.3];

type DepsOverrides = {
  getEmbedding?: (texto: string, tipo: string) => Promise<number[]>;
  getHeuristicas?: (params: any) => Promise<any[]>;
  getMemorias?: (userId: string, params: any) => Promise<any[]>;
  debug?: () => boolean;
  logger?: { warn: (msg: string) => void };
};

function createDeps(overrides: DepsOverrides = {}) {
  const calls: Record<string, unknown[]> = {
    getEmbedding: [],
    getHeuristicas: [],
    getMemorias: [],
  };

  const warnings: string[] = [];

  const deps = {
    getEmbedding: async (texto: string, tipo: string) => {
      calls.getEmbedding.push([texto, tipo]);
      if (overrides.getEmbedding) {
        return overrides.getEmbedding(texto, tipo);
      }
      return fakeEmbedding;
    },
    getHeuristicas: async (params: any) => {
      calls.getHeuristicas.push(params);
      if (overrides.getHeuristicas) {
        return overrides.getHeuristicas(params);
      }
      return ["heuristica"];
    },
    getMemorias: async (userId: string, params: any) => {
      calls.getMemorias.push([userId, params]);
      if (overrides.getMemorias) {
        return overrides.getMemorias(userId, params);
      }
      return ["mem" as any];
    },
    logger: {
      warn: (msg: string) => {
        warnings.push(msg);
        overrides.logger?.warn?.(msg);
      },
    },
    debug: overrides.debug ?? (() => true),
  } as const;

  const service = new ParallelFetchService(deps as any);
  return { service, calls, warnings };
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

test("continua execução com embedding vazio quando getEmbedding falha", async () => {
  const { service, calls, warnings } = createDeps({
    getEmbedding: async () => {
      throw new Error("embedding indisponível");
    },
  });

  const res = await service.run({ ultimaMsg: "preciso de ajuda", userId: "user" });

  assert.deepStrictEqual(res, {
    heuristicas: [],
    memsSemelhantes: [],
    userEmbedding: [],
  } satisfies ParallelFetchResult);
  assert.strictEqual(calls.getHeuristicas.length, 0);
  assert.strictEqual(calls.getMemorias.length, 0);
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /getEmbedding falhou: embedding indisponível/);
});

