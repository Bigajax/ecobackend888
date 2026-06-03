import test from "node:test";
import assert from "node:assert";

import { GreetingPipeline } from "../../services/conversation/greeting";
import { respostaSaudacaoAutomatica } from "../../utils/respostaSaudacaoAutomatica";
import { temaDaMemoria } from "../../services/conversation/greetingMemory";

function createPipeline() {
  const marks: Array<string | undefined> = [];
  const guard = {
    can: () => true,
    mark: (userId?: string) => {
      marks.push(userId);
    },
  } as const;

  return { pipeline: new GreetingPipeline(guard as any), marks };
}

// Supabase fake: cadeia .from().select().eq().gte().order().limit().maybeSingle()
function fakeSupabase(row: any, opts?: { throwOnQuery?: boolean }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => {
      if (opts?.throwOnQuery) throw new Error("db down");
      return { data: row };
    },
  };
  return { from: () => chain };
}

test("dispara saudação automática para cumprimentos conhecidos", async () => {
  const greetings = ["hello", "hey Eco", "fala aí"];

  for (const message of greetings) {
    const auto = respostaSaudacaoAutomatica({
      messages: [{ role: "user", content: message }],
    });

    assert.ok(auto, `respostaSaudacaoAutomatica deveria retornar meta para "${message}"`);
    assert.strictEqual(
      auto.meta.isGreeting,
      true,
      `meta.isGreeting deveria ser true para "${message}"`,
    );

    const { pipeline, marks } = createPipeline();
    const result = await pipeline.handle({
      messages: [{ role: "user", content: message }],
      ultimaMsg: message,
      greetingEnabled: true,
      userId: "user-123",
    });

    assert.strictEqual(result.handled, true, `pipeline deve tratar "${message}"`);
    assert.ok(result.response && result.response.length > 0, "deve haver resposta automática");
    assert.deepStrictEqual(marks, ["user-123"], "guard.mark deve ser acionado");
  }
});

test("não envia saudação quando há conteúdo substantivo", async () => {
  const { pipeline, marks } = createPipeline();
  const message = "fala aí, preciso de ajuda com um projeto?";

  const result = await pipeline.handle({
    messages: [{ role: "user", content: message }],
    ultimaMsg: message,
    greetingEnabled: true,
    userId: "user-456",
  });

  assert.deepStrictEqual(result, { handled: false });
  assert.deepStrictEqual(marks, []);
});

test("não repete saudação automática quando assistente já respondeu", async () => {
  const { pipeline, marks } = createPipeline();

  const history = [
    { role: "assistant", content: "Olá! Como posso ajudar hoje?" },
    { role: "user", content: "Oi" },
  ];

  const result = await pipeline.handle({
    messages: history,
    ultimaMsg: "Oi",
    greetingEnabled: true,
    userId: "user-789",
  });

  assert.deepStrictEqual(result, { handled: false });
  assert.deepStrictEqual(marks, []);
});

test("abertura puxa o tema quando há memória marcante (≥7)", async () => {
  const { pipeline } = createPipeline();
  const result = await pipeline.handle({
    messages: [{ role: "user", content: "oi" }],
    ultimaMsg: "oi",
    greetingEnabled: true,
    userId: "user-mem",
    supabase: fakeSupabase({ tags: ["lançamento do app"], intensidade: 8 }),
  });

  assert.strictEqual(result.handled, true);
  assert.ok(
    /l[aâ]n[çc]amento do app/i.test(result.response ?? ""),
    `abertura deveria referenciar o tema; veio: "${result.response}"`,
  );
});

test("abertura neutra quando não há memória marcante", async () => {
  const { pipeline } = createPipeline();
  const result = await pipeline.handle({
    messages: [{ role: "user", content: "oi" }],
    ultimaMsg: "oi",
    greetingEnabled: true,
    userId: "user-sem-mem",
    supabase: fakeSupabase(null), // gte(7) não retornou nada
  });

  assert.strictEqual(result.handled, true);
  assert.ok(result.response && result.response.length > 0);
  assert.ok(!/ronda, ou aliviou|ficou comigo|na cabeça/i.test(result.response ?? ""));
});

test("convidado não consulta memória (abertura neutra)", async () => {
  const { pipeline } = createPipeline();
  let consultou = false;
  const spySupabase = {
    from: () => {
      consultou = true;
      return fakeSupabase({ tags: ["x"], intensidade: 9 }).from();
    },
  };

  const result = await pipeline.handle({
    messages: [{ role: "user", content: "oi" }],
    ultimaMsg: "oi",
    greetingEnabled: true,
    userId: "guest-1",
    isGuest: true,
    supabase: spySupabase,
  });

  assert.strictEqual(result.handled, true);
  assert.strictEqual(consultou, false, "não deve consultar memória para convidado");
});

test("erro no supabase degrada para abertura neutra (sem throw)", async () => {
  const { pipeline } = createPipeline();
  const result = await pipeline.handle({
    messages: [{ role: "user", content: "oi" }],
    ultimaMsg: "oi",
    greetingEnabled: true,
    userId: "user-erro",
    supabase: fakeSupabase(null, { throwOnQuery: true }),
  });

  assert.strictEqual(result.handled, true);
  assert.ok(result.response && result.response.length > 0);
});

test("temaDaMemoria limpa tags e respeita limites", () => {
  assert.strictEqual(temaDaMemoria({ tags: ["mudanca_de_emprego"] }), "mudanca de emprego");
  // tag curtinha junta com a próxima para dar corpo
  assert.strictEqual(temaDaMemoria({ tags: ["app", "dinheiro"] }), "app e dinheiro");
  // tags genéricas são descartadas
  assert.strictEqual(temaDaMemoria({ tags: ["outros"] }), null);
  assert.strictEqual(temaDaMemoria({ tags: [] }), null);
  assert.strictEqual(temaDaMemoria(null), null);
  // tema longo demais → null
  assert.strictEqual(temaDaMemoria({ tags: ["a".repeat(50)] }), null);
});
