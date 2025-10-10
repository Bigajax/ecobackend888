// server/routes/promptRoutes.ts
import { Router, type Request, type Response } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import { log } from "../services/promptContext/logger";
import type { EcoStreamHandler, EcoStreamEvent } from "../services/conversation/types";

const router = Router();

console.log("Backend: promptRoutes carregado.");

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

/** Helper para extrair texto de qualquer payload possível */
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
        "text", "content", "texto", "output_text", "outputText", "output",
        "answer", "reply", "resposta", "respostaFinal", "fala", "speech", "message", "delta"
      ];
      for (const k of keysTextFirst) {
        const t = tryList(val[k]);
        if (t) return t;
      }
      // paths comuns
      const paths = [
        ["response","text"], ["response","content"], ["response","message"],
        ["result","text"], ["result","content"], ["result","message"],
        ["payload","text"], ["payload","content"], ["payload","message"],
      ] as const;
      for (const p of paths) {
        const t = tryList(val[p[0]]?.[p[1]]);
        if (t) return t;
      }
      // choices estilo OpenAI/Claude
      if (Array.isArray(val.choices)) {
        for (const c of val.choices) {
          const t =
            tryList(c.delta) || tryList(c.message) || tryList(c.text) || tryList(c.content);
          if (t) return t;
        }
      }
    }
    return undefined;
  };

  return tryList(payload);
}

/** POST /api/ask-eco — stream SSE */
router.post("/ask-eco", async (req: Request, res: Response) => {
  const accept = String(req.headers.accept || "").toLowerCase();
  const wantsStream = !accept || accept.includes("text/event-stream") || accept.includes("*/*");

  const origin = (req.headers.origin as string) || "*";
  const guestIdFromMiddleware: string | undefined = (req as any)?.guest?.id || undefined;

  const {
    mensagens,
    nome_usuario,
    usuario_id,
    clientHour,
    isGuest,
    guestId,
    sessionMeta,
  } = (req.body ?? {}) as Record<string, any>;

  const bearer =
    req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;

  const params: Record<string, unknown> = {
    messages: Array.isArray(mensagens) ? mensagens : [],
    isGuest: Boolean(isGuest),
  };

  if (typeof bearer === "string") params.accessToken = bearer;
  if (typeof clientHour === "number") params.clientHour = clientHour;
  if (sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta)) {
    params.sessionMeta = sessionMeta;
  }
  if (typeof nome_usuario === "string") params.userName = nome_usuario;
  if (typeof usuario_id === "string") params.userId = usuario_id;

  const guestIdToSend =
    typeof guestId === "string" && guestId.trim() ? guestId : guestIdFromMiddleware;
  if (typeof guestIdToSend === "string") params.guestId = guestIdToSend;

  if (!wantsStream) {
    try {
      const result = await getEcoResponse(params as any);
      const text = extractTextLoose(result) ?? "";
      log.info("[ask-eco] fallback JSON response", {
        mode: "json",
        hasContent: text.length > 0,
      });
      return res.status(200).json({ content: text || null, raw: result });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error?.message ?? error);
      log.error("[ask-eco] fallback JSON error", { message });
      return res.status(500).json({ error: message });
    }
  }

  // fix: ensure SSE headers and initial handshake before LLM call
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Guest-Id, X-Guest-Mode"
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Guest-Id, Content-Type, Cache-Control");
  res.setHeader("Vary", "Origin");
  if (guestIdFromMiddleware) res.setHeader("x-guest-id", guestIdFromMiddleware);

  const flush = (res as any).flushHeaders;
  if (typeof flush === "function") flush.call(res);

  const state = {
    done: false,
    sawChunk: false,
    finishReason: "",
    closed: false,
  };

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch (error) {
      clearInterval(heartbeat);
    }
  }, 20_000);

  const safeWrite = (payload: string) => {
    if (state.done || state.closed) return;
    try {
      res.write(payload);
    } catch (error) {
      state.closed = true;
    }
  };

  const sendReady = () => {
    log.info("[ask-eco] SSE ready", {
      origin,
      guestId: guestIdFromMiddleware ?? guestIdToSend ?? null,
    });
    safeWrite("event: ready\ndata: {}\n\n");
  };

  const sendChunk = (piece: string) => {
    if (!piece || typeof piece !== "string") return;
    state.sawChunk = true;
    log.info("[ask-eco] SSE chunk", { size: piece.length });
    safeWrite(`data: ${JSON.stringify({ delta: { content: piece } })}\n\n`);
  };

  const sendError = (message: string) => {
    log.error("[ask-eco] SSE error", { message });
    safeWrite(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
  };

  const sendDone = (reason: string | null | undefined) => {
    if (state.done) return;
    state.finishReason = reason ?? state.finishReason ?? "unknown";
    log.info("[ask-eco] SSE done", {
      finishReason: state.finishReason || reason || "unknown",
      sawChunk: state.sawChunk,
    });
    try {
      res.write("data: [DONE]\\n\\n");
    } catch (error) {
      state.closed = true;
    }
    state.done = true;
    try {
      res.end();
    } catch {
      /* noop */
    }
    clearInterval(heartbeat);
  };

  sendReady();

  req.on("close", () => {
    state.closed = true;
    if (!state.done) {
      sendError("client_closed");
      sendDone("client_closed");
    }
  });

  const forwardEvent = (rawEvt: EcoStreamEvent | any) => {
    if (state.done || state.closed) return;
    const evt = rawEvt as any;
    const type = String(evt?.type || "");

    switch (type) {
      case "control": {
        const name = evt?.name;
        if (name === "done") {
          sendDone(evt?.meta?.finishReason ?? evt?.finishReason ?? "done");
        }
        return;
      }
      case "chunk":
      case "delta":
      case "token": {
        const delta = evt?.delta ?? evt?.content ?? evt?.text ?? evt?.message;
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
        sendError(message);
        sendDone("error");
        return;
      }
      default:
        return;
    }
  };

  try {
    const stream: EcoStreamHandler = { onEvent: (event) => forwardEvent(event) };
    const result = await getEcoResponse({ ...params, stream } as any);

    if (!state.done) {
      const text = extractTextLoose(result);
      if (typeof text === "string" && text.trim()) {
        sendChunk(text);
      }
      sendDone(text ? "bridge_fallback" : "fallback");
    }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error?.message ?? error);
    sendError(message || "Erro desconhecido");
    sendDone("error");
  }
});

export default router;
