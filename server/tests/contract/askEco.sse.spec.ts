import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import supertest from "supertest";

import type { EcoStreamHandler } from "../../services/conversation/types";

const getEcoResponseMock = jest.fn();

jest.mock("../../services/ConversationOrchestrator", () => ({
  __esModule: true,
  getEcoResponse: (...args: unknown[]) => getEcoResponseMock(...args),
}));

const capturedSseEvents: Array<{ event: string; data: string }> = [];

class MockRequest extends EventEmitter {
  body: any;
  headers: Record<string, string>;
  method = "POST";
  query: Record<string, unknown> = {};
  ip = "127.0.0.1";
  path = "/api/ask-eco";
  originalUrl = "/api/ask-eco";
  guest: { id?: string } = {};
  guestId?: string;
  user?: { id?: string };

  constructor(body: any, headers: Record<string, string>) {
    super();
    this.body = body;
    this.headers = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    );
  }

  get(name: string) {
    return this.headers[name.toLowerCase()];
  }
}

class MockResponse {
  statusCode = 200;
  private readonly headers = new Map<string, string>();
  readonly chunks: string[] = [];
  ended = false;
  locals: Record<string, unknown> = {};

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name: string) {
    return this.headers.get(name.toLowerCase());
  }

  removeHeader(name: string) {
    this.headers.delete(name.toLowerCase());
  }

  write(chunk: string | Buffer) {
    const payload = typeof chunk === "string" ? chunk : chunk.toString();
    this.chunks.push(payload);
    return true;
  }

  end() {
    this.ended = true;
    return this;
  }

  flush() {}

  flushHeaders() {}

  json(payload: unknown) {
    this.chunks.push(JSON.stringify(payload));
    this.end();
    return this;
  }
}

function parseSse(raw: string) {
  return raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLines = lines.filter((line) => line.startsWith("data:"));
      const eventName = eventLine ? eventLine.replace(/^event:\s*/, "").trim() : "message";
      const data = dataLines.map((line) => line.replace(/^data:\s*/, "")).join("\n");
      return { event: eventName, data };
    });
}

jest.mock("../../utils/sse", () => {
  const actual = jest.requireActual("../../utils/sse");
  const events: Array<{ event: string; data: string }> = capturedSseEvents;

  return {
    __esModule: true,
    ...actual,
    createSSE: (res: any, _req: any) => {
      const recordEvent = (event: string, data: unknown) => {
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        events.push({ event, data: payload });
        res.write(`event: ${event}\n`);
        res.write(`data: ${payload}\n\n`);
      };

      return {
        send: (event: string, data: unknown) => recordEvent(event, data),
        sendControl: (name: string, meta?: Record<string, unknown>) =>
          recordEvent("control", { name, ...(meta ?? {}) }),
        end: () => {
          if (!res.writableEnded) {
            res.end();
          }
        },
      };
    },
    __sseTest: {
      events,
      reset: () => {
        events.length = 0;
      },
    },
  };
});

function extractEventSequence(blocks: Array<{ event: string; data: string }>) {
  return blocks
    .map(({ event, data }) => {
      if (event === "control") {
        try {
          const payload = JSON.parse(data);
          const name = typeof payload?.name === "string" ? payload.name : null;
          if (name === "done") return null;
          return name;
        } catch {
          return null;
        }
      }
      if (event === "done" || event === "first_token" || event === "chunk" || event === "meta") {
        return event === "first_token" ? "first_token" : event;
      }
      if (event === "memory_saved" || event === "latency") {
        return event;
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry));
}

async function createApp() {
  const { createTestApp } = await import("./utils/app");
  return createTestApp();
}

const guestId = "5f9b4c1d-1234-4abc-9def-1234567890ab";
const sessionId = "session-test-123";

describe("/api/ask-eco SSE contract", () => {
  beforeEach(() => {
    getEcoResponseMock.mockReset();
    capturedSseEvents.length = 0;
  });

  it("streams SSE events with echoed headers and aggregated done payload", async () => {
    getEcoResponseMock.mockImplementation(async (args: any) => {
      const { stream } = (args ?? {}) as { stream?: EcoStreamHandler };
      const events: Array<any> = [
        { type: "control", name: "meta", meta: { etapa: "prompt" } },
        { type: "first_token", delta: "Olá" },
        { type: "chunk", delta: " mundo", index: 1 },
        {
          type: "control",
          name: "memory_saved",
          meta: { memoriaId: "mem-1", primeiraMemoriaSignificativa: true, intensidade: 0.9 },
        },
        {
          type: "control",
          name: "done",
          meta: {
            finishReason: "stop",
            usage: { prompt_tokens: 12, completion_tokens: 7 },
            interaction_id: "interaction-123",
          },
          timings: { llmStart: 10, llmEnd: 25 },
        },
      ];

      for (const evt of events) {
        await stream?.onEvent(evt);
      }

      return {
        meta: { interaction_id: "interaction-123", canal: "chat" },
        usage: { prompt_tokens: 12, completion_tokens: 7 },
        timings: { llmStart: 10, llmEnd: 25 },
      };
    });

    const { askEcoRoutes } = await import("../../routes/promptRoutes");
    const handlerLayer = askEcoRoutes.stack.find((layer: any) => layer.route?.path === "/");
    if (!handlerLayer) {
      throw new Error("/api/ask-eco handler not found");
    }
    const handler = handlerLayer.route.stack[0]?.handle;
    if (typeof handler !== "function") {
      throw new Error("/api/ask-eco handler missing");
    }

    const req = new MockRequest(
      {
        stream: true,
        messages: [{ role: "user", content: "Olá?" }],
      },
      {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "X-Eco-Guest-Id": guestId,
        "X-Eco-Session-Id": sessionId,
      }
    );
    req.guest = { id: guestId };
    req.guestId = guestId;
    req.user = { id: guestId };

    const res = new MockResponse();
    res.setHeader("X-Eco-Guest-Id", guestId);
    res.setHeader("X-Eco-Session-Id", sessionId);

    await handler(req as any, res as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("x-eco-guest-id")).toBe(guestId);
    expect(res.getHeader("x-eco-session-id")).toBe(sessionId);
    expect(getEcoResponseMock).toHaveBeenCalledTimes(1);
    const callArgs = getEcoResponseMock.mock.calls[0]?.[0] as { stream?: EcoStreamHandler };
    expect(callArgs?.stream).toBeDefined();

    const events = parseSse(res.chunks.join(""));
    const sequence = extractEventSequence(events);
    const promptIndex = sequence.indexOf("prompt_ready");
    const firstTokenIndex = sequence.indexOf("first_token");
    const firstChunkIndex = sequence.indexOf("chunk");
    const lastChunkIndex = sequence.lastIndexOf("chunk");
    const latencyIndex = sequence.indexOf("latency");
    const doneIndex = sequence.lastIndexOf("done");

    expect(promptIndex).toBe(0);
    expect(firstChunkIndex).toBeGreaterThan(-1);
    expect(lastChunkIndex).toBeGreaterThanOrEqual(firstChunkIndex);
    expect(latencyIndex).toBeGreaterThan(-1);
    expect(doneIndex).toBeGreaterThan(-1);
    expect(firstChunkIndex).toBeGreaterThan(firstTokenIndex);
    expect(latencyIndex).toBeGreaterThan(lastChunkIndex);
    expect(doneIndex).toBeGreaterThan(latencyIndex);

    const afterChunks = sequence.slice(lastChunkIndex + 1);
    const latencyPosition = afterChunks.indexOf("latency");
    const donePosition = afterChunks.indexOf("done");

    expect(latencyPosition).toBeGreaterThanOrEqual(0);
    expect(donePosition).toBeGreaterThan(latencyPosition);
    expect(sequence).toContain("memory_saved");

    const latencyEvent = events.find((evt) => evt.event === "latency");
    expect(latencyEvent).toBeDefined();
    const latencyPayload = JSON.parse(latencyEvent!.data);
    expect(latencyPayload).toMatchObject({
      first_token_latency_ms: expect.any(Number),
      total_latency_ms: expect.any(Number),
      marks: { llmStart: 10, llmEnd: 25 },
    });

    const doneEvent = events.find((evt) => evt.event === "done");
    expect(doneEvent).toBeDefined();
    const donePayload = JSON.parse(doneEvent!.data);
    expect(donePayload).toMatchObject({
      content: "Olámundo",
      interaction_id: "interaction-123",
      tokens: { in: 12, out: 7 },
      timings: expect.objectContaining({ llmStart: 10, llmEnd: 25 }),
      at: expect.any(String),
      sinceStartMs: expect.any(Number),
    });
    expect(donePayload.meta).toEqual(
      expect.objectContaining({
        etapa: "prompt",
        type: "llm_status",
        memory_events: expect.any(Array),
      })
    );
    expect(Array.isArray(donePayload.meta.memory_events)).toBe(true);
    expect(donePayload.meta.memory_events[0]).toMatchObject({ memoriaId: "mem-1" });
  });

  it("returns the done payload when stream=false", async () => {
    getEcoResponseMock.mockImplementation(async () => ({
      meta: { interaction_id: "interaction-json", tags: ["eco"] },
      usage: { prompt_tokens: 5, completion_tokens: 9 },
      timings: { llmStart: 3, llmEnd: 18 },
      message: "Olá JSON",
    }));

    const app = await createApp();
    const agent = supertest(app);

    const response = await agent
      .post("/api/ask-eco")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .send({
        stream: false,
        messages: [{ role: "user", content: "Tudo bem?" }],
      });

    expect(response.status).toBe(200);
    expect(response.headers["x-eco-guest-id"]).toBe(guestId);
    expect(response.body).toMatchObject({
      content: "Olá JSON",
      interaction_id: "interaction-json",
      tokens: { in: 5, out: 9 },
      meta: { interaction_id: "interaction-json", tags: ["eco"] },
      timings: { llmStart: 3, llmEnd: 18 },
      sinceStartMs: 0,
      at: expect.any(String),
    });
  });
});
