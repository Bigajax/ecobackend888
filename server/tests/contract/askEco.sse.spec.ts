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

const capturedSseEvents: string[] = [];
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

  header(name: string) {
    return this.get(name);
  }

  // Express usa req.is("application/json") no guard de content-type (415).
  is(type: string) {
    const contentType = (this.headers["content-type"] ?? "").toLowerCase();
    const needle = type.includes("/") ? type.toLowerCase() : `/${type.toLowerCase()}`;
    return contentType.includes(needle.replace(/^\//, "")) ? type : false;
  }
}

class MockResponse {
  statusCode = 200;
  private readonly headers = new Map<string, string>();
  readonly chunks: string[] = [];
  ended = false;
  headersSent = false;
  locals: Record<string, unknown> = {};

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  // O setup SSE usa res.writeHead(200, headers) quando !headersSent.
  writeHead(code: number, headers?: Record<string, string>) {
    this.statusCode = code;
    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, String(value));
      }
    }
    this.headersSent = true;
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

type ParsedContractFrame = { event: string | null; data: Record<string, unknown> | null };

function parseSse(raw: string): ParsedContractFrame[] {
  return raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      let eventName: string | null = null;
      const dataLines: string[] = [];

      for (const line of block.split("\n")) {
        if (line.startsWith(":")) {
          continue;
        }
        if (line.startsWith("event:")) {
          eventName = line.replace(/^event:\s*/, "").trim() || null;
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.replace(/^data:\s*/, ""));
        }
      }

      if (!dataLines.length) {
        return { event: eventName, data: null } satisfies ParsedContractFrame;
      }

      const payloadRaw = dataLines.join("");
      try {
        const parsed = JSON.parse(payloadRaw) as Record<string, unknown>;
        if (parsed?.type === "ping") {
          return { event: eventName, data: null } satisfies ParsedContractFrame;
        }
        return { event: eventName, data: parsed } satisfies ParsedContractFrame;
      } catch {
        return { event: eventName, data: null } satisfies ParsedContractFrame;
      }
    })
    .filter((entry): entry is ParsedContractFrame => entry.data !== null);
}

jest.mock("../../utils/sse", () => {
  const actual = jest.requireActual("../../utils/sse");
  const events: string[] = capturedSseEvents;

  return {
    __esModule: true,
    ...actual,
    createSSE: (res: any, _req: any, opts: any = {}) => {
      const normalize = (data: unknown) => {
        if (typeof data === "string") {
          try {
            return { raw: data, parsed: JSON.parse(data) };
          } catch {
            return { raw: data, parsed: data };
          }
        }
        const raw = JSON.stringify(data);
        return { raw, parsed: data };
      };

      const emit = (event: string, data: unknown) => {
        const { raw, parsed } = normalize(data);
        events.push(JSON.stringify({ event, data: parsed }));
        res.write(`event: ${event}\ndata: ${raw}\n\n`);
      };

      if (typeof opts?.commentOnOpen === "string") {
        res.write(`:${opts.commentOnOpen}\n\n`);
      }

      return {
        send: (event: string, data: unknown) => emit(event, data),
        sendControl: (
          name: "prompt_ready" | "done" | "guard_fallback_trigger",
          payload?: Record<string, unknown>,
        ) => emit(name, { type: name, ...(payload ?? {}) }),
        sendComment: (comment: string) => {
          res.write(`:${comment}\n\n`);
        },
        write: (data: unknown) => emit("message", data),
        end: () => {
          if (typeof opts?.onConnectionClose === "function") {
            opts.onConnectionClose({ source: "mock.end" });
          }
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
// O ensureIdentity (cadeia real do app, exercida no teste via supertest) exige
// X-Eco-Session-Id em formato UUID v4 — senão responde 400 missing_session_id.
const sessionId = "8a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";

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
        if (evt.type === "first_token" && typeof evt.delta === "string") {
          await stream?.onChunk?.({ index: 0, text: evt.delta });
        }
        if (evt.type === "chunk") {
          const text =
            typeof evt.delta === "string"
              ? evt.delta
              : typeof (evt.delta as any)?.content === "string"
              ? ((evt.delta as any).content as string)
              : "";
          if (text) {
            await stream?.onChunk?.({ index: evt.index ?? 0, text });
          }
        }
        if (evt.type === "control" && evt.name === "done") {
          await stream?.onChunk?.({ done: true, meta: evt.meta });
        }
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
    // A rota é post("/", ensureIdentity, handleAskEcoRequest): stack[0] é o
    // ensureIdentity (rejeitaria o mock). O handler real é o ÚLTIMO da stack.
    const routeStack = handlerLayer.route.stack;
    const handler = routeStack[routeStack.length - 1]?.handle;
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
        // Streaming exige Origin permitido (senão 403 em promptRoutes); usa um do allowlist.
        Origin: "http://localhost:5173",
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

    const frames = parseSse(res.chunks.join(""));
    expect(frames.length).toBeGreaterThan(0);

    const streamIdHeader = res.getHeader("x-stream-id");
    expect(typeof streamIdHeader === "string" && streamIdHeader.length > 0).toBe(true);

    frames.forEach((frame) => {
      if (!frame.data) return;
      expect(frame.data.streamId === streamIdHeader || frame.data.streamId === null).toBe(true);
    });

    const contractEvents = frames
      .filter((frame) => frame.event === "chunk" || frame.event === "done")
      .map((frame) =>
        frame.event === "done"
          ? { kind: "done", payload: frame.data }
          : { kind: "chunk", payload: frame.data }
      );
    const chunkEvents = contractEvents.filter((evt) => evt.kind === "chunk");
    const doneEvent = contractEvents.find((evt) => evt.kind === "done");

    expect(chunkEvents.length).toBeGreaterThanOrEqual(2);
    expect(chunkEvents[0].payload).toMatchObject({ index: 0, delta: "Olá" });
    expect(chunkEvents[1].payload).toMatchObject({ index: 1, delta: " mundo" });
    if (chunkEvents.length > 2) {
      expect(chunkEvents[2].payload).toMatchObject({ delta: expect.any(String) });
    }
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.payload).toMatchObject({ index: 2, done: true });

    const doneFrame = frames.find((frame) => frame.event === "done");
    const aggregatedText = doneFrame?.data?.response?.messages?.[0]?.content?.[0]?.text;
    expect(aggregatedText).toEqual(expect.any(String));
    expect(aggregatedText).toContain("Olá mundo");
    // (Antes esperava também o texto de fallback "Não consegui responder agora...",
    // mas isso só é emitido quando o stream não produz conteúdo. Com o stream
    // produzindo "Olá mundo", o fallback não dispara — assertion removida.)

    expect(
      capturedSseEvents
        .map((entry) => JSON.parse(entry) as { event?: string })
        .every((payload) => payload && typeof payload.event === "string")
    ).toBe(true);
    const parsedEvents = capturedSseEvents.map(
      (entry) => JSON.parse(entry) as { event?: string; data?: any }
    );
    const finalCaptured = [...parsedEvents].reverse().find((payload) => payload.event === "done");
    expect(finalCaptured).toBeDefined();
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
      .set("Origin", "http://localhost:5173")
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
