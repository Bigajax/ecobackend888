import test from "node:test";
import assert from "node:assert";

import { claudeChatCompletion, streamClaudeChatCompletion } from "../../core/ClaudeAdapter";

const mockStream = (chunks: string[]) => {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
};

test("should handle non-streaming response", async (context) => {
  const mockFetch = context.mock.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [
        {
          message: {
            content: [{ type: "text", text: "Hello, world!" }],
          },
        },
      ],
      model: "claude-3-opus-20240229",
      usage: {
        total_tokens: 10,
      },
    }),
  }));

  global.fetch = mockFetch as unknown as typeof fetch;

  const result = await claudeChatCompletion(
    {
      messages: [{ role: "user", content: "Hello" }],
    },
  );

  assert.strictEqual(result.content, "Hello, world!");
});

test("should handle streaming response", async (context) => {
  // OpenRouter usa o formato OpenAI (choices[].delta.content), não o nativo da Anthropic.
  const streamChunks = [
    'data: {"choices": [{"delta": {"content": "Hello"}}]}\n\n',
    'data: {"choices": [{"delta": {"content": ", "}}]}\n\n',
    'data: {"choices": [{"delta": {"content": "world!"}}]}\n\n',
    'data: {"choices": [{"delta": {}, "finish_reason": "stop"}]}\n\n',
    "data: [DONE]\n\n",
  ];

  const mockFetch = context.mock.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (name: string) => (name?.toLowerCase() === "content-type" ? "text/event-stream" : null) },
    json: async () => ({}),
    body: mockStream(streamChunks),
  }));

  global.fetch = mockFetch as unknown as typeof fetch;

  const chunks: any[] = [];
  await streamClaudeChatCompletion(
    {
      messages: [{ role: "user", content: "Hello" }],
    },
    {
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    }
  );

  assert.deepStrictEqual(chunks.map(c => c.content), ["Hello", ", ", "world!"]);
});

test("should handle empty content in response", async (context) => {
  const mockFetch = context.mock.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [
        {
          message: {
            content: [],
          },
        },
      ],
      model: "claude-3-opus-20240229",
      usage: {
        total_tokens: 5,
      },
    }),
  }));

  global.fetch = mockFetch as unknown as typeof fetch;

  const result = await claudeChatCompletion(
    {
      messages: [{ role: "user", content: "Hello" }],
    },
  );

  assert.strictEqual(result.content, "");
});
