import { StreamSession } from "../../routes/askEco/streaming";

const createMockResponse = () => ({
  headers: new Map<string, string>(),
  write: () => {},
  end: () => {},
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

  expect(session.aggregatedText).toBe("Olá mundo");
  expect(session.chunkReceived).toBe(true);
  expect(session.lastChunkIndex).toBe(1);

  const eventTypes = session.offlineEvents.map((event) => event.type);
  expect(eventTypes).toContain("message");
  expect(eventTypes[eventTypes.length - 1]).toBe("done");
});
