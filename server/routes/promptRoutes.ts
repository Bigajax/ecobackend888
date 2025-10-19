// server/routes/promptRoutes.ts
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import { STREAM_TIMEOUT_MESSAGE } from "./askEco/streaming";
import { log } from "../services/promptContext/logger";
import type { EcoStreamHandler, EcoStreamEvent } from "../services/conversation/types";
import { createHttpError, isHttpError } from "../utils/http";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { createSSE } from "../utils/sse";
import { applyCorsResponseHeaders } from "../middleware/cors";

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
const askEcoRouter = Router();

export { askEcoRouter as askEcoRoutes };

console.log("Backend: promptRoutes carregado.");

const REQUIRE_GUEST_ID =
  String(process.env.ECO_REQUIRE_GUEST_ID ?? "false").toLowerCase() === "true";

const DEFAULT_STREAM_TIMEOUT_MS = 45_000;
const streamTimeoutMs = (() => {
  const raw = process.env.ECO_SSE_TIMEOUT_MS;
  if (!raw) return DEFAULT_STREAM_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_STREAM_TIMEOUT_MS;
  }
  return parsed;
})();

type RequestWithIdentity = Request & {
  guestId?: string | null;
  user?: { id?: string | null } | null;
};

function disableCompressionForSse(response: Response) {
  response.setHeader("Content-Encoding", "identity");
  response.setHeader("X-No-Compression", "1");
  (response as any).removeHeader?.("Content-Length");
}

function prepareSseHeaders(_req: Request, res: Response) {
  res.setHeader("Access-Control-Allow-Credentials", "false");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

function extractSessionIdLoose(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const candidates = [
    source.sessionId,
    source.session_id,
    source.sessionID,
    source.sessaoId,
    source.sessao_id,
    source.sessaoID,
    source.session,
    source.sessao,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
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

/**
 * Extrai texto de eventos vindos do orquestrador de streaming.
 * Os adaptadores nem sempre usam a mesma chave, então varremos uma lista ampla
 * de campos conhecidos, caindo em `extractTextLoose` para objetos aninhados.
 */
function extractEventText(event: unknown): string | undefined {
  if (!event) return undefined;

  const candidates: unknown[] = [];

  if (typeof event === "string") {
    candidates.push(event);
  } else if (typeof event === "object") {
    const obj = event as Record<string, unknown>;
    const delta = obj.delta;
    if (delta !== undefined) {
      candidates.push(delta);
      if (typeof delta === "object" && delta !== null) {
        const deltaObj = delta as Record<string, unknown>;
        candidates.push(deltaObj.content, deltaObj.text, deltaObj.value);
        if (Array.isArray(deltaObj.content)) {
          candidates.push(deltaObj.content.join(""));
        }
      }
    }
    candidates.push(
      obj.content,
      obj.text,
      obj.message,
      obj.output,
      obj.output_text,
      obj.response,
      obj.value
    );
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    const extracted = extractTextLoose(candidate);
    if (extracted) {
      return extracted;
    }
  }

  return typeof event === "string" ? event : extractTextLoose(event);
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
askEcoRouter.post("/", async (req: Request, res: Response) => {
  applyCorsResponseHeaders(req, res);
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

  (res.locals as Record<string, unknown>).isSse = wantsStream;

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

  const sessionMetaObject =
    sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta)
      ? (sessionMeta as Record<string, unknown>)
      : undefined;

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
    if (sessionMetaObject) {
      (params as any).sessionMeta = sessionMetaObject;
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
    disableCompressionForSse(res);
    prepareSseHeaders(req, res);

    const telemetryClient = (() => {
      const client = getSupabaseAdmin();
      if (!client) return null;
      try {
        return client.schema("analytics");
      } catch {
        return null;
      }
    })();

    let resolvedInteractionId: string | null = null;
    const pendingSignals: Array<{ signal: string; meta: Record<string, unknown> }> = [];


    const compactMeta = (meta: Record<string, unknown>): Record<string, unknown> => {
      return Object.entries(meta).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
      }, {});
    };

    const sendSignalRow = (interactionId: string, signal: string, meta: Record<string, unknown>) => {
      if (!telemetryClient) return;
      const payload = { interaction_id: interactionId, signal, meta };
      void Promise.resolve(
        telemetryClient
          .from("eco_passive_signals")
          .insert([payload])
      )
        .then(({ error }) => {
          if (error) {
            log.error("[ask-eco] telemetry_failed", {
              signal,
              message: error.message,
              code: error.code ?? null,
              table: "eco_passive_signals",
              payload,
            });
            return;
          }
          log.info("[ask-eco] telemetry_inserted", {
            signal,
            table: "eco_passive_signals",
            interaction_id: interactionId,
          });
        })
        .catch((error: unknown) => {
          log.error("[ask-eco] telemetry_failed", {
            signal,
            message: error instanceof Error ? error.message : String(error),
            table: "eco_passive_signals",
            payload,
          });
        });
    };

    const flushPendingSignals = (interactionId: string) => {
      if (!interactionId || !pendingSignals.length) return;
      const queued = pendingSignals.splice(0, pendingSignals.length);
      for (const item of queued) {
        sendSignalRow(interactionId, item.signal, item.meta);
      }
    };

    const captureInteractionId = (value: unknown) => {
      if (resolvedInteractionId) return;
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      resolvedInteractionId = trimmed;
      flushPendingSignals(trimmed);
    };

    const enqueuePassiveSignal = (
      signal: string,
      value?: number | null,
      meta?: Record<string, unknown>
    ) => {
      if (!telemetryClient) return;
      let serializedMeta: Record<string, unknown> = {};
      if (meta && typeof meta === "object") {
        serializedMeta = compactMeta(meta);
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        serializedMeta = { ...serializedMeta, value };
      }

      try {
        serializedMeta = JSON.parse(JSON.stringify(serializedMeta));
      } catch (error) {
        log.debug("[ask-eco] telemetry_meta_failed", {
          signal,
          message: error instanceof Error ? error.message : String(error),
        });
        serializedMeta = {};
      }

      if (resolvedInteractionId) {
        sendSignalRow(resolvedInteractionId, signal, serializedMeta);
        return;
      }

      pendingSignals.push({ signal, meta: serializedMeta });
    };

    const state = {
      done: false,
      sawChunk: false,
      finishReason: "" as string | undefined,
      clientClosed: false,
      firstSent: false,
      t0: Date.now(),
      firstTokenAt: 0,
      chunksCount: 0,
      bytesCount: 0,
      lastChunkAt: 0,
      model: null as string | null,
      firstTokenTelemetrySent: false,
    };

    const idleTimeoutMs =
      Number.isFinite(streamTimeoutMs) && streamTimeoutMs > 0 ? streamTimeoutMs : 120_000;

    const sse = createSSE(res, req, {
      heartbeatMs: 15_000,
      idleMs: idleTimeoutMs,
      onIdle: handleStreamTimeout,
    });

    log.info("[ask-eco] stream_start", {
      origin: origin ?? null,
      idleTimeoutMs,
    });

    const recordFirstTokenTelemetry = (chunkBytes: number) => {
      if (state.firstTokenTelemetrySent) return;
      state.firstTokenTelemetrySent = true;
      const latency = state.firstTokenAt ? state.firstTokenAt - state.t0 : null;
      enqueuePassiveSignal(
        "first_token",
        1,
        compactMeta({ latency_ms: latency ?? undefined, chunk_bytes: chunkBytes })
      );
    };

    function sendMeta(obj: Record<string, unknown>) {
      sse.send("meta", obj);
    }

    function sendToken(text: string) {
      sse.send("token", { text });
    }

    function sendErrorEvent(payload: Record<string, unknown>) {
      log.error("[ask-eco] sse_error", { ...payload });
      sse.send("error", payload);
    }

    function sendDone(reason?: string | null) {
      if (state.done) return;
      state.finishReason = reason ?? state.finishReason ?? "unknown";
      state.done = true;

      const firstTokenLatency = state.firstTokenAt ? state.firstTokenAt - state.t0 : null;
      const finishedAt = state.lastChunkAt || Date.now();
      const totalLatency = finishedAt - state.t0;

      sendMeta({
        type: "llm_status",
        firstTokenLatencyMs: firstTokenLatency,
        chunks: state.chunksCount,
        bytes: state.bytesCount,
      });

      const finishReason = state.finishReason || "unknown";
      if (state.sawChunk) {
        log.info("[ask-eco] sse_done", {
          finishReason,
          sawChunk: state.sawChunk,
          chunks: state.chunksCount,
          bytes: state.bytesCount,
        });
      } else {
        log.debug("[ask-eco] sse_done_no_chunk", {
          finishReason,
          clientClosed: state.clientClosed,
        });
      }

      sse.sendControl("done", {
        reason: finishReason,
        totalChunks: state.chunksCount,
        bytes: state.bytesCount,
        durationMs: totalLatency,
      });

      log.info("[ask-eco] stream_end", {
        finishReason,
        chunks: state.chunksCount,
        bytes: state.bytesCount,
        clientClosed: state.clientClosed,
        origin: origin ?? null,
      });

      const doneValue = finishReason === "error" || finishReason === "timeout" ? 0 : 1;
      enqueuePassiveSignal(
        "done",
        doneValue,
        compactMeta({
          finish_reason: finishReason,
          chunks: state.chunksCount,
          bytes: state.bytesCount,
          first_token_latency_ms: firstTokenLatency ?? undefined,
          total_latency_ms: totalLatency,
          model: state.model ?? undefined,
          saw_chunk: state.sawChunk,
        })
      );

      sse.end();
    }

    function handleStreamTimeout() {
      if (state.done || state.clientClosed || state.sawChunk) {
        return;
      }
      log.warn("[ask-eco] sse_timeout", { timeoutMs: idleTimeoutMs });
      sendChunk(STREAM_TIMEOUT_MESSAGE);
      sendDone("timeout");
    }

    function sendChunk(piece: string) {
      if (!piece || typeof piece !== "string") return;
      const cleaned = sanitizeOutput(piece);
      const finalText = cleaned || piece.trim();
      if (!finalText) return;

      state.sawChunk = true;
      const chunkIndex = state.chunksCount;
      const chunkBytes = Buffer.byteLength(finalText, "utf8");
      state.bytesCount += chunkBytes;
      const now = Date.now();
      state.lastChunkAt = now;

      if (!state.firstSent) {
        state.firstSent = true;
        state.firstTokenAt = now;
        sse.send("first_token", { delta: finalText });
        sendMeta({ type: "first_token_latency_ms", value: state.firstTokenAt - state.t0 });
        recordFirstTokenTelemetry(chunkBytes);
      }

      sse.send("chunk", { delta: finalText, index: chunkIndex });

      state.chunksCount = chunkIndex + 1;

      sendToken(finalText);
    }

    sse.sendControl("prompt_ready", { stream: true });
    enqueuePassiveSignal("prompt_ready", 1, {
      stream: true,
      origin: origin ?? null,
    });

    req.on("close", () => {
      if (state.clientClosed) return;
      state.clientClosed = true;
      if (!state.done) {
        log.warn("[ask-eco] sse_client_closed", {
          origin,
        });
        state.finishReason = state.finishReason || "client_closed";
        state.done = true;
        log.info("[ask-eco] stream_end", {
          finishReason: state.finishReason,
          chunks: state.chunksCount,
          bytes: state.bytesCount,
          clientClosed: state.clientClosed,
          origin: origin ?? null,
        });
        sse.end();
      }
    });

    const forwardEvent = (rawEvt: EcoStreamEvent | any) => {
      if (state.done || state.clientClosed) return;
      const evt = rawEvt as any;
      const type = String(evt?.type || "");

      switch (type) {
        case "control": {
          const name = typeof evt?.name === "string" ? evt.name : "";
          const meta = evt?.meta && typeof evt.meta === "object" ? (evt.meta as Record<string, unknown>) : null;
          if (meta) {
            captureInteractionId((meta as { interaction_id?: unknown }).interaction_id);
            const maybeModel =
              typeof meta.model === "string"
                ? meta.model
                : typeof (meta as any).modelo === "string"
                ? (meta as any).modelo
                : undefined;
            if (maybeModel) state.model = maybeModel;
          }
          if (name === "done") {
            sendDone(evt?.meta?.finishReason ?? evt?.finishReason ?? "done");
          }
          return;
        }
        case "first_token":
        case "chunk":
        case "delta":
        case "token": {
          const text = extractEventText(evt);
          if (typeof text === "string" && text) {
            sendChunk(text);
          }
          return;
        }
        case "done": {
          const meta = evt?.meta && typeof evt.meta === "object" ? (evt.meta as Record<string, unknown>) : null;
          if (meta) {
            captureInteractionId((meta as { interaction_id?: unknown }).interaction_id);
            const maybeModel =
              typeof meta.model === "string"
                ? meta.model
                : typeof (meta as any).modelo === "string"
                ? (meta as any).modelo
                : undefined;
            if (maybeModel) state.model = maybeModel;
          }
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
          const text = extractEventText(evt);
          if (typeof text === "string" && text) {
            sendChunk(text);
          }
          return;
        }
      }
    };

    try {
      const stream: EcoStreamHandler = { onEvent: (event) => forwardEvent(event) };
      const result = await getEcoResponse({ ...params, stream } as any);

      if (result && typeof result === "object") {
        const maybeModel =
          typeof (result as any).modelo === "string"
            ? (result as any).modelo
            : typeof (result as any).model === "string"
            ? (result as any).model
            : undefined;
        if (maybeModel) state.model = maybeModel;
        captureInteractionId((result as any)?.meta?.interaction_id);
      }

      if (!state.done) {
        if (!state.sawChunk) {
          const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
          if (textOut) {
            sendChunk(textOut);
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
        log.error("[ask-eco] sse_unexpected", {
          trace_id: traceId,
          message: (error as Error)?.message,
        });
        sendErrorEvent({ code: "INTERNAL_ERROR", trace_id: traceId });
      }
      sendDone("error");
    } finally {
      if (!state.done) {
        sse.end();
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

router.use("/ask-eco", askEcoRouter);

export default router;
