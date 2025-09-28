import test from "node:test";
import assert from "node:assert";

import { GreetingPipeline } from "../../services/conversation/greeting";
import { respostaSaudacaoAutomatica } from "../../utils/respostaSaudacaoAutomatica";

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

test("dispara saudação automática para cumprimentos conhecidos", () => {
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
    const result = pipeline.handle({
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

test("não envia saudação quando há conteúdo substantivo", () => {
  const { pipeline, marks } = createPipeline();
  const message = "fala aí, preciso de ajuda com um projeto?";

  const result = pipeline.handle({
    messages: [{ role: "user", content: message }],
    ultimaMsg: message,
    greetingEnabled: true,
    userId: "user-456",
  });

  assert.deepStrictEqual(result, { handled: false });
  assert.deepStrictEqual(marks, []);
});
