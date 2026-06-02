import test from "node:test";
import assert from "node:assert/strict";

import { StreamSession } from "../../routes/askEco/streaming";

const createMockResponse = () => ({
  headers: new Map<string, string>(),
  write: () => {},
  end: () => {},
  on: () => {},
  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  },
  flush: () => {},
  flushHeaders: () => {},
});

test("StreamSession aggregates text and records offline events when not streaming", () => {
  const req = { headers: {} } as any;
  const res = createMockResponse();
  const session = new StreamSession({
    req,
    res: res as any,
    respondAsStream: false,
    activationTracer: null,
    startTime: 0,
    streamId: "test-stream-123",
  });

  session.initialize(false);

  session.dispatchEvent({ type: "message", index: 0, text: "Olá" });
  session.dispatchEvent({ type: "message", text: " mundo" });
  session.dispatchEvent({ type: "done" });

  assert.strictEqual(session.aggregatedText, "Olá mundo");
  assert.strictEqual(session.chunkReceived, true);
  assert.strictEqual(session.lastChunkIndex, 1);

  const eventTypes = session.offlineEvents.map((event) => event.type);
  assert.ok(eventTypes.includes("message"));
  assert.strictEqual(eventTypes[eventTypes.length - 1], "done");
});
