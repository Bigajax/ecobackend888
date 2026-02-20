import test from "node:test";
import assert from "node:assert";

import { loadConversationContext } from "../../services/conversation/derivadosLoader";
import type { Derivados } from "../../services/derivadosService";
import type { ParallelFetchResult } from "../../services/conversation/parallelFetch";

process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";

const parallelResult: ParallelFetchResult = {
  heuristicas: ["h1"],
  userEmbedding: [0.1, 0.2],
  memsSemelhantes: ["mem"],
  sources: { heuristicas: "live", mems: "live" },
};

test("usa derivados do cache quando disponíveis", async () => {
  const cached: Derivados = {
    top_temas_30d: [],
    marcos: [],
    heuristica_interacao: {
      efeitos_ultimas_10: { abriu: 1, fechou: 0, neutro: 0 },
      media_score: 0.2,
      dica_estilo: "ok",
    },
  };

  let fromCalled = false;
  const supabase = {
    from() {
      fromCalled = true;
      throw new Error("should not query supabase when cached");
    },
  };

  const cache = {
    get: () => cached,
    set: () => {
      throw new Error("should not update cache when already cached");
    },
  };

  const result = await loadConversationContext("user-1", "olá", supabase, {
    cache,
    parallelFetchService: {
      run: async () => parallelResult,
    },
  });

  assert.strictEqual(fromCalled, false);
  assert.deepStrictEqual(result.derivados, cached);
  assert.deepStrictEqual(result.heuristicas, parallelResult.heuristicas);
  assert.deepStrictEqual(result.userEmbedding, parallelResult.userEmbedding);
  assert.deepStrictEqual(result.memsSemelhantes, parallelResult.memsSemelhantes);
});

test("retorna null para derivados quando timeout ocorre", async () => {
  const calls: string[] = [];
  const supabase = {
    from(table: string) {
      calls.push(table);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return Promise.resolve({ data: [] });
        },
      };
    },
  };

  let cacheSet = false;
  const cache = new Map<string, Derivados>();

  const result = await loadConversationContext("user-2", "oi", supabase, {
    cache: {
      get: (key) => cache.get(key) ?? undefined,
      set: (key, value) => {
        cacheSet = true;
        cache.set(key, value);
      },
    },
    parallelFetchService: {
      run: async (): Promise<ParallelFetchResult> => ({
        heuristicas: [],
        userEmbedding: [],
        memsSemelhantes: [],
        sources: { heuristicas: "empty", mems: "empty" },
      }),
    },
    withTimeoutOrNullFn: async () => null,
  });

  assert.deepStrictEqual(calls, [
    "user_theme_stats",
    "user_temporal_milestones",
    "interaction_effects",
  ]);
  assert.strictEqual(result.derivados, null);
  assert.strictEqual(result.aberturaHibrida, null);
  assert.strictEqual(cacheSet, false);
});

test("transforma efeitos em estrutura compatível com insight de abertura", async () => {
  const dataByTable: Record<string, any[]> = {
    user_theme_stats: [
      { tema: "sono", freq_30d: 3, int_media_30d: 0.1 },
    ],
    user_temporal_milestones: [
      { tema: "rotina", resumo_evolucao: "consegui manter", marco_at: "2024-01-01" },
    ],
    interaction_effects: [
      { efeito: "abriu", score: 0.3, created_at: "2024-01-02" },
      { efeito: "neutro", score: -0.1, created_at: "2024-01-03" },
    ],
  };

  function createBuilder(table: string) {
    const self: any = {
      select() {
        return self;
      },
      eq() {
        return self;
      },
      order() {
        return self;
      },
      limit() {
        return Promise.resolve({ data: dataByTable[table] || [] });
      },
    };
    return self;
  }

  const supabase = {
    from(table: string) {
      return createBuilder(table);
    },
  };

  const result = await loadConversationContext("user-3", "quero refletir", supabase, {
    parallelFetchService: {
      run: async (): Promise<ParallelFetchResult> => ({
        heuristicas: ["hx"],
        userEmbedding: [1, 2],
        memsSemelhantes: ["memx"],
        sources: { heuristicas: "live", mems: "live" },
      }),
    },
  });

  assert.ok(result.derivados);
  assert.deepStrictEqual(result.derivados?.heuristica_interacao.efeitos_ultimas_10, {
    abriu: 1,
    fechou: 0,
    neutro: 1,
  });
  assert.strictEqual(result.derivados?.heuristica_interacao.media_score, 0.1);
  assert.strictEqual(result.aberturaHibrida, "consegui manter");
  assert.deepStrictEqual(result.heuristicas, ["hx"]);
  assert.deepStrictEqual(result.userEmbedding, [1, 2]);
  assert.deepStrictEqual(result.memsSemelhantes, ["memx"]);
});

test("invoca callback onDerivadosError quando leitura falha", async () => {
  const errors: unknown[] = [];

  const failingBuilder: any = {
    select() {
      throw new Error("boom");
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: [] });
    },
  };

  const supabase = {
    from() {
      return failingBuilder;
    },
  };

  const cache = {
    get: () => undefined,
    set: () => undefined,
  };

  const result = await loadConversationContext("user-4", "teste", supabase, {
    cache,
    onDerivadosError: (error) => {
      errors.push(error);
    },
    parallelFetchService: {
      run: async () => parallelResult,
    },
  });

  assert.strictEqual(result.derivados, null);
  assert.deepStrictEqual(errors.length, 1);
  assert.strictEqual(result.aberturaHibrida, null);
});
