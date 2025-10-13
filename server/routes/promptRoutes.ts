// server/routes/promptRoutes.ts
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import { log } from "../services/promptContext/logger";
import type { EcoStreamHandler, EcoStreamEvent } from "../services/conversation/types";
import { createHttpError, isHttpError } from "../utils/http";

/** Sanitiza a saída removendo blocos ```json``` e JSON final pendurado */
function sanitizeOutput(input?: string): string {
  const txt = input ?? "";
  return txt
    // remove blocos ```json ... ```
    .replace(/```(?:json)?[\s\S]*?```/gi, "")
    // remove possível payload JSON final
    .replace(/\{[\s\S]*?\}\s*$/g, "")
    .trim();
}

const router = Router();

console.log("Backend: promptRoutes carregado.");

const REQUIRE_GUEST_ID =
  String(process.env.ECO_REQUIRE_GUEST_ID ?? "false").toLowerCase() === "true";

type RequestWithIdentity = Request & {
  guestId?: string | null;
  user?: { id?: string | null } | null;
};

function disableCompressionForSse(response: Response) {
  response.setHeader("Content-Encoding", "identity");
  response.setHeader("X-No-Compression", "1");
  (response as any).removeHeader?.("Content-Length");
}

/** GET /api/prompt-preview */
router.get("/prompt-preview", async (req: Request, res: Response) => {
  try {
    await getPromptEcoPreview(req, res);
  } catch (error) {
    console.error("Erro no handler de rota /prompt-preview:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro interno ao montar o prompt." });
    }
  }
});

/** Extrai texto de payloads em formatos variados (defensivo) */
function extractTextLoose(payload: any): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === "string" && payload.trim()) return payload.trim();

  const tryList = (val: any): string | undefined => {
    if (!val) return undefined;
    if (typeof val === "string" && val.trim()) return val.trim();

    if (Array.isArray(val)) {
      for (const v of val) {
        const t = tryList(v);
        if (t) return t;
      }
    } else if (typeof val === "object") {
      const keysTextFirst = [
        "text",
        "content",
        "texto",
        "output_text",
        "outputText",
        "output",
        "answer",
        "reply",
        "resposta",
        "respostaFinal",
        "fala",
        "speech",
        "message",
        "delta",
      ];
      for (const k of keysTextFirst) {
        const t = tryList((val as any)[k]);
        if (t) return t;
      }

      const paths = [
        ["response", "text"],
        ["response", "content"],
        ["response", "message"],
        ["result", "text"],
        ["result", "content"],
        ["result", "message"],
        ["payload", "text"],
        ["payload", "content"],
        ["payload", "message"],
      ] as const;
      for (const p of paths) {
        const t = tryList((val as any)[p[0]]?.[p[1]]);
        if (t) return t;
      }

      if (Array.isArray((val as any).choices)) {
        for (const c of (val as any).choices) {
          const t =
            tryList((c as any).delta) ||
            tryList((c as any).message) ||
            tryList((c as any).text) ||
            tryList((c as any).content);
          if (t) return t;
        }
      }
    }
    return undefined;
  };

  return tryList(payload);
}

function getGuestIdFromCookies(req: Request): string | undefined {
  const cookieGuestId = (req as any)?.cookies?.guest_id;
  if (typeof cookieGuestId === "string" && cookieGuestId.trim()) {
    return cookieGuestId.trim();
  }

  const rawCookie = req.headers.cookie;
  if (!rawCookie) return undefined;

  for (const piece of rawCookie.split(";")) {
    const [key, ...rest] = piece.split("=");
    if (!key) continue;
    if (key.trim() === "guest_id") {
      try {
        const value = rest.join("=");
        const decoded = decodeURIComponent(value ?? "");
        if (decoded.trim()) {
          return decoded.trim();
        }
      } catch {
        /* ignore decode errors */
      }
    }
  }

  return undefined;
}

type NormalizedMessage = { id?: string; role: string; content: string };

function normalizeMessages(payload: unknown): { messages: NormalizedMessage[]; shape: string } {
  const body = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const result: NormalizedMessage[] = [];
  let shape: "text" | "mensagem" | "mensagens" | "invalid" = "invalid";

  const sourceArray: unknown = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.mensagens)
    ? body.mensagens
    : undefined;

  if (Array.isArray(sourceArray)) {
    shape = "mensagens";
    for (const raw of sourceArray) {
      if (!raw || typeof raw !== "object") continue;
      const roleValue = (raw as any).role;
      const contentValue =
        (raw as any).content ??
        (raw as any).text ??
        (raw as any).mensagem ??
        (raw as any).message ??
        (raw as any).delta ??
        (raw as any).value;
      const role = typeof roleValue === "string" && roleValue.trim() ? roleValue.trim() : "user";
      let content: string = "";
      if (typeof contentValue === "string") {
        content = contentValue;
      } else if (contentValue != null) {
        try {
          content = JSON.stringify(contentValue);
        } catch {
          content = String(contentValue);
        }
      }
      const normalized: NormalizedMessage = { role, content };
      if (typeof (raw as any).id === "string") {
        normalized.id = (raw as any).id;
      }
      result.push(normalized);
    }
    return { messages: result, shape };
  }

  const singleText = typeof body.text === "string" && body.text.trim();
  if (singleText) {
    shape = "text";
    result.push({ role: "user", content: body.text });
    return { messages: result, shape };
  }

  const singleMensagem = typeof body.mensagem === "string" && body.mensagem.trim();
  if (singleMensagem) {
    shape = "mensagem";
    result.push({ role: "user", content: body.mensagem });
    return { messages: result, shape };
  }

  return { messages: result, shape };
}

function resolveGuestId(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

/** POST /api/ask-eco — stream SSE (ou JSON se cliente não pedir SSE) */
router.post("/ask-eco", async (req: Request, res: Response) => {
  const reqWithIdentity = req as RequestWithIdentity;
  const accept = String(req.headers.accept || "").toLowerCase();
  const streamParam = (() => {
    const fromQuery = (req.query as any)?.stream;
    if (typeof fromQuery === "string") return fromQuery;
    if (Array.isArray(fromQuery)) return fromQuery[fromQuery.length - 1];
    const bodyValue = (req.body as any)?.stream;
    if (typeof bodyValue === "string") return bodyValue;
    if (typeof bodyValue === "boolean") return bodyValue ? "true" : "false";
    return undefined;
  })();
  const wantsStreamByFlag = typeof streamParam === "string" && /^(1|true|yes)$/i.test(streamParam.trim());
  const wantsStream = wantsStreamByFlag || accept.includes("text/event-stream");
  const origin = (req.headers.origin as string) || undefined;

  const guestIdFromSession: string | undefined = (req as any)?.guest?.id || undefined;
  const guestIdFromRequest =
    typeof reqWithIdentity.guestId === "string" ? reqWithIdentity.guestId : undefined;
  const guestIdFromHeader = req.get("X-Guest-Id")?.trim();
  const guestIdFromCookie = getGuestIdFromCookies(req);

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, any>) : {};
  const {
    nome_usuario,
    usuario_id,
    clientHour,
    isGuest,
    guestId,
    sessionMeta,
  } = body;

  const normalized = normalizeMessages(body);
  const payloadShape = normalized.shape;

  const guestIdResolved = resolveGuestId(
    typeof guestId === "string" ? guestId : undefined,
    guestIdFromHeader,
    guestIdFromCookie,
    guestIdFromRequest,
    guestIdFromSession
  );

  const identityKey =
    (typeof reqWithIdentity.user?.id === "string" && reqWithIdentity.user.id.trim()
      ? reqWithIdentity.user.id.trim()
      : null) ??
    (typeof reqWithIdentity.guestId === "string" && reqWithIdentity.guestId.trim()
      ? reqWithIdentity.guestId.trim()
      : null);
  const hasGuestId = Boolean(identityKey);
  const userMode = reqWithIdentity.user?.id ? "authenticated" : "guest";

  log.info("[ask-eco] request", {
    origin: origin ?? null,
    mode: wantsStream ? "sse" : "json",
    hasGuestId,
    userMode,
    identityKey,
    payloadShape,
  });

  try {
    if (!normalized.messages.length) {
      throw createHttpError(400, "BAD_REQUEST", "Payload inválido (text/mensagem/mensagens)");
    }

    const hasUserMessage = normalized.messages.some(
      (msg) => msg.role === "user" && typeof msg.content === "string" && msg.content.trim()
    );

    if (!hasUserMessage) {
      throw createHttpError(400, "BAD_REQUEST", "Inclua ao menos uma mensagem de usuário válida");
    }

    if (REQUIRE_GUEST_ID && !hasGuestId) {
      throw createHttpError(400, "MISSING_GUEST_ID", "Informe X-Guest-Id");
    }

    const bearer =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;

    const params: Record<string, unknown> = {
      messages: normalized.messages,
      isGuest: Boolean(isGuest),
    };

    if (typeof bearer === "string" && bearer.trim()) {
      (params as any).accessToken = bearer.trim();
    }
    if (typeof clientHour === "number" && Number.isFinite(clientHour)) {
      (params as any).clientHour = clientHour;
    }
    if (sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta)) {
      (params as any).sessionMeta = sessionMeta;
    }
    if (typeof nome_usuario === "string" && nome_usuario.trim()) {
      (params as any).userName = nome_usuario.trim();
    }
    if (typeof usuario_id === "string" && usuario_id.trim()) {
      (params as any).userId = usuario_id.trim();
    }
    if (typeof reqWithIdentity.guestId === "string" && reqWithIdentity.guestId.trim()) {
      (params as any).guestId = reqWithIdentity.guestId.trim();
    } else if (guestIdResolved) {
      (params as any).guestId = guestIdResolved;
    }

    if (identityKey && typeof (params as any).distinctId !== "string") {
      (params as any).distinctId = identityKey;
    }
    if (identityKey && typeof (params as any).userId !== "string") {
      (params as any).userId = identityKey;
    }

    // JSON mode
    if (!wantsStream) {
      try {
        const result = await getEcoResponse(params as any);
        const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
        log.info("[ask-eco] response", {
          mode: "json",
          hasContent: textOut.length > 0,
        });
        return res.status(200).json({ content: textOut || null });
      } catch (error) {
        if (isHttpError(error)) {
          log.warn("[ask-eco] json_error", { code: (error as any).body?.code, status: error.status });
          return res.status(error.status).json((error as any).body);
        }
        const traceId = randomUUID();
        log.error("[ask-eco] json_unexpected", { trace_id: traceId, message: (error as Error)?.message });
        return res.status(500).json({ code: "INTERNAL_ERROR", trace_id: traceId });
      }
    }

    // SSE mode
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    disableCompressionForSse(res);
    res.setHeader("X-Accel-Buffering", "no");

    res.status(200);
    (res as any).flushHeaders?.();

    const state = {
      done: false,
      sawChunk: false,
      finishReason: "" as string | undefined,
      clientClosed: false,
      // novos campos para latência e contadores
      firstSent: false,
      t0: Date.now(),
      firstTokenAt: 0,
      chunksCount: 0,
      bytesCount: 0,
    };

    let heartbeat: NodeJS.Timeout | null = null;

    const isWritable = () => {
      if (state.clientClosed) return false;
      if ((res as any).writableEnded || (res as any).writableFinished) return false;
      if ((res as any).destroyed) return false;
      return true;
    };

    const safeWrite = (payload: string) => {
      if (!isWritable()) return;
      try {
        res.write(payload);
        (res as any).flush?.();
      } catch {
        state.clientClosed = true;
      }
    };

    const sendMeta = (obj: Record<string, unknown>) => {
      safeWrite(`event: meta\ndata: ${JSON.stringify(obj)}\n\n`);
    };

    const sendDone = (reason?: string | null) => {
      if (state.done) return;
      state.finishReason = reason ?? state.finishReason ?? "unknown";
      state.done = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }

      // status final
      sendMeta({
        type: "llm_status",
        firstTokenLatencyMs: state.firstTokenAt ? state.firstTokenAt - state.t0 : null,
        chunks: state.chunksCount,
        bytes: state.bytesCount,
      });

      log.info("[ask-eco] sse_done", {
        finishReason: state.finishReason || "unknown",
        sawChunk: state.sawChunk,
        chunks: state.chunksCount,
        bytes: state.bytesCount,
      });

      if (!state.clientClosed) {
        safeWrite(`event: done\ndata: ${JSON.stringify({ reason: state.finishReason || "unknown" })}\n\n`);
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
    };

    const sendErrorEvent = (payload: Record<string, unknown>) => {
      log.error("[ask-eco] sse_error", { ...payload });
      safeWrite(`event: error\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    // Emite first_token no primeiro pedaço e chunk nos demais
    const sendChunk = (piece: string) => {
      if (!piece || typeof piece !== "string") return;
      const cleaned = sanitizeOutput(piece);
      if (!cleaned) return;

      state.sawChunk = true;
      state.chunksCount += 1;
      state.bytesCount += Buffer.byteLength(cleaned, "utf8");

      if (!state.firstSent) {
        state.firstSent = true;
        state.firstTokenAt = Date.now();
        safeWrite(`event: first_token\ndata: ${JSON.stringify(cleaned)}\n\n`);
        sendMeta({ type: "first_token_latency_ms", value: state.firstTokenAt - state.t0 });
      } else {
        safeWrite(`event: chunk\ndata: ${JSON.stringify(cleaned)}\n\n`);
      }
    };

    // abertura do stream
    safeWrite(`event: ping\ndata: {}\n\n`);
    sendMeta({ type: "prompt_ready" });

    heartbeat = setInterval(() => {
      safeWrite(`event: ping\ndata: "${Date.now()}"\n\n`);
    }, 20_000);

    req.on("close", () => {
      if (state.clientClosed) return;
      state.clientClosed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (!state.done) {
        log.warn("[ask-eco] sse_client_closed", {
          origin,
        });
      }
    });

    const forwardEvent = (rawEvt: EcoStreamEvent | any) => {
      if (state.done || state.clientClosed) return;
      const evt = rawEvt as any;
      const type = String(evt?.type || "");

      switch (type) {
        case "control": {
          if (evt?.name === "done") {
            sendDone(evt?.meta?.finishReason ?? evt?.finishReason ?? "done");
          }
          return;
        }
        case "chunk":
        case "delta":
        case "token": {
          const delta =
            evt?.delta?.content ??
            evt?.delta ??
            evt?.content ??
            evt?.text ??
            evt?.message;
          if (typeof delta === "string" && delta.trim()) {
            sendChunk(delta);
          }
          return;
        }
        case "done": {
          sendDone(evt?.meta?.finishReason ?? evt?.finishReason ?? "done");
          return;
        }
        case "error": {
          const message =
            typeof evt?.message === "string"
              ? evt.message
              : evt?.error?.message || "Erro desconhecido";
          sendErrorEvent({ message });
          sendDone("error");
          return;
        }
        default: {
          const delta =
            evt?.delta?.content ??
            evt?.delta ??
            evt?.content ??
            evt?.text ??
            evt?.message;
          if (typeof delta === "string" && delta.trim()) {
            sendChunk(delta);
          }
          return;
        }
      }
    };

    try {
      const stream: EcoStreamHandler = { onEvent: (event) => forwardEvent(event) };
      const result = await getEcoResponse({ ...params, stream } as any);

      if (!state.done) {
        if (!state.sawChunk) {
          const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
          if (textOut) {
            sendChunk(textOut); // emite first_token / chunk conforme necessário
          }
          sendDone(textOut ? "fallback_no_stream" : "fallback_empty");
        } else {
          sendDone("stream_done");
        }
      }
    } catch (error) {
      if (isHttpError(error)) {
        sendErrorEvent({ ...error.body, status: error.status });
      } else {
        const traceId = randomUUID();
        log.error("[ask-eco] sse_unexpected", { trace_id: traceId, message: (error as Error)?.message });
        sendErrorEvent({ code: "INTERNAL_ERROR", trace_id: traceId });
      }
      sendDone("error");
    } finally {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    }
  } catch (error) {
    if (isHttpError(error)) {
      return res.status(error.status).json(error.body);
    }
    const traceId = randomUUID();
    log.error("[ask-eco] validation_unexpected", { trace_id: traceId, message: (error as Error)?.message });
    return res.status(500).json({ code: "INTERNAL_ERROR", trace_id: traceId });
  }
});

export default router;
