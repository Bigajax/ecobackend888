import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import supertest from "supertest";

import type { EcoStreamHandler } from "../../services/conversation/types";

const getEcoResponseMock = jest.fn();
const createInteractionMock = jest.fn(async () => "interaction-123");

jest.mock("../../services/ConversationOrchestrator", () => ({
  __esModule: true,
  getEcoResponse: (...args: unknown[]) => getEcoResponseMock(...args),
}));

jest.mock("../../services/conversation/interactionAnalytics", () => ({
  __esModule: true,
  createInteraction: (...args: unknown[]) => createInteractionMock(...args),
}));

const capturedSseEvents: Array<{ event: string; data: string }> = [];
const DEFAULT_USUARIO_ID = "a1b2c3d4-e5f6-4a7b-9c8d-ef0123456789";

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
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const normalized = { ...body } as Record<string, any>;
      const textoRaw =
        typeof normalized.texto === "string" ? normalized.texto.trim() : "";
      if (!textoRaw) {
        const firstUserMessage = Array.isArray(normalized.messages)
          ? normalized.messages.find(
              (msg: any) =>
                msg && typeof msg.content === "string" && msg.role === "user"
            )?.content
          : null;
        const fallbackTexto =
          typeof firstUserMessage === "string" && firstUserMessage.trim()
            ? firstUserMessage.trim()
            : "Olá";
        normalized.texto = fallbackTexto;
      } else {
        normalized.texto = textoRaw;
      }

      const usuarioIdRaw =
        typeof normalized.usuario_id === "string" && normalized.usuario_id.trim()
          ? normalized.usuario_id.trim()
          : DEFAULT_USUARIO_ID;
      normalized.usuario_id = usuarioIdRaw;
      this.body = normalized;
    } else {
      this.body = body;
    }
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
        sendControl: (name: "prompt_ready" | "done") =>
          recordEvent("control", { name }),
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

async function createApp() {
  const { createTestApp } = await import("./utils/app");
  return createTestApp();
}

const guestId = "5f9b4c1d-1234-4abc-9def-1234567890ab";
const sessionId = "session-test-123";

describe("/api/ask-eco SSE contract", () => {
  beforeEach(() => {
    getEcoResponseMock.mockReset();
    createInteractionMock.mockReset();
    createInteractionMock.mockResolvedValue("interaction-123");
    capturedSseEvents.length = 0;
  });

  it("streams SSE events with minimal payload", async () => {
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
    const handlerLayer = askEcoRoutes.stack.find(
      (layer: any) => layer.route?.path === "/" && layer.route?.methods?.post
    );
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
        clientMessageId: "sse-message-1",
      },
      {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "X-Eco-Guest-Id": guestId,
        "X-Eco-Session-Id": sessionId,
        "X-Eco-Client-Message-Id": "sse-message-1",
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
    expect(events.length).toBeGreaterThan(0);

    const controlEvents = events.filter((evt) => evt.event === "control");
    const chunkEvents = events.filter((evt) => evt.event === "chunk");
    const otherEvents = events.filter((evt) => !["control", "chunk"].includes(evt.event));

    expect(otherEvents).toHaveLength(0);
    expect(controlEvents[0]).toEqual({ event: "control", data: '{"name":"prompt_ready"}' });
    expect(controlEvents[controlEvents.length - 1]).toEqual({
      event: "control",
      data: '{"name":"done"}',
    });
    expect(chunkEvents).toHaveLength(2);
    const parsedChunks = chunkEvents.map((evt) => JSON.parse(evt.data));
    expect(parsedChunks[0]).toEqual({ index: 0, delta: "Olá" });
    expect(parsedChunks[1]).toEqual({ index: 1, delta: "mundo" });

    expect(capturedSseEvents.every((evt) => ["control", "chunk"].includes(evt.event))).toBe(true);
    expect(capturedSseEvents[0]).toEqual({
      event: "control",
      data: JSON.stringify({ name: "prompt_ready" }),
    });
    expect(capturedSseEvents[capturedSseEvents.length - 1]).toEqual({
      event: "control",
      data: JSON.stringify({ name: "done" }),
    });
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
      .set("X-Eco-Client-Message-Id", "json-message-1")
      .send({
        stream: false,
        usuario_id: guestId,
        texto: "Tudo bem?",
        messages: [{ role: "user", content: "Tudo bem?" }],
        clientMessageId: "json-message-1",
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
