import test from "node:test";
import assert from "node:assert";
import { performance } from "node:perf_hooks";

import { claudeChatCompletion } from "../../core/ClaudeAdapter";

const SUCCESS_RESPONSE = {
  choices: [{ message: { content: "fallback-response" } }],
  model: "fallback-model",
  usage: {},
};

test("usa timeout configurado para acionar fallback rapidamente", async (t) => {
  const originalFetch = global.fetch;
  const originalTimeout = process.env.ECO_CLAUDE_TIMEOUT_MS;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test";
  const configuredTimeout = 80;
  process.env.ECO_CLAUDE_TIMEOUT_MS = String(configuredTimeout);

  const callMoments: number[] = [];
  const start = performance.now();

  global.fetch = ((input: any, init?: any) => {
    const callIndex = callMoments.push(performance.now() - start) - 1;

    if (!init?.signal) {
      throw new Error("esperava AbortSignal no fetch");
    }

    if (typeof init.agent !== "function") {
      throw new Error("esperava agent keep-alive configurado");
    }

    if (callIndex === 0) {
      return new Promise<never>((_, reject) => {
        const signal = init.signal!;

        if (signal.aborted) {
          reject(signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" }));
          return;
        }

        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          const reason =
            signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" });
          reject(reason);
        };

        signal.addEventListener("abort", onAbort, { once: true });
      });
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => SUCCESS_RESPONSE,
    });
  }) as typeof fetch;

  t.after(() => {
    global.fetch = originalFetch;
    if (originalTimeout === undefined) {
      delete process.env.ECO_CLAUDE_TIMEOUT_MS;
    } else {
      process.env.ECO_CLAUDE_TIMEOUT_MS = originalTimeout;
    }
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  });

  const result = await claudeChatCompletion({
    messages: [{ role: "user", content: "olá" }],
    model: "main-model",
    fallbackModel: "fallback-model",
  });

  assert.strictEqual(result.model, "fallback-model");
  assert.strictEqual(result.content, "fallback-response");
  assert.strictEqual(callMoments.length, 2, "esperava tentativa original + fallback");

  const fallbackDelay = callMoments[1];
  const acceptableWindow = configuredTimeout + 120;
  assert.ok(
    fallbackDelay < acceptableWindow,
    `fallback demorou ${fallbackDelay.toFixed(2)}ms (> ${acceptableWindow}ms)`
  );
});
