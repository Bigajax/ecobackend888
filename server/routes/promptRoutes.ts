// server/routes/promptRoutes.ts
import { Router, type Request, type Response } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import { log } from "../services/promptContext/logger";
import type { EcoStreamHandler, EcoStreamEvent } from "../services/conversation/types";

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

/** POST /api/ask-eco — stream SSE (ou JSON se cliente não pedir SSE) */
router.post("/ask-eco", async (req: Request, res: Response) => {
  const accept = String(req.headers.accept || "").toLowerCase();
  const wantsStream = !accept || accept.includes("text/event-stream"); // só stream se pedir explicitamente

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
    text, // suporte a payload simples: { "text": "..." }
  } = (req.body ?? {}) as Record<string, any>;

  const bearer =
    req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;

  // Montagem de params base
  const params: Record<string, unknown> = {
    messages: Array.isArray(mensagens) ? mensagens : [],
    isGuest: Boolean(isGuest),
  };

  // Se não vier "mensagens" mas vier "text", monte a última mensagem de usuário
  if ((!Array.isArray(mensagens) || mensagens.length === 0) && typeof text === "string" && text.trim()) {
    (params as any).messages = [{ role: "user", content: text.trim() }];
  }

  // Validação mínima
  const hasMessages =
    Array.isArray((params as any).messages) && (params as any).messages.length > 0;
  if (!hasMessages) {
    return res.status(400).json({ error: "Campo 'text' ou 'mensagens' é obrigatório" });
  }

  if (typeof bearer === "string") (params as any).accessToken = bearer;
  if (typeof clientHour === "number") (params as any).clientHour = clientHour;

  if (sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta)) {
    (params as any).sessionMeta = sessionMeta;
  }
  if (typeof nome_usuario === "string") (params as any).userName = nome_usuario;
  if (typeof usuario_id === "string") (params as any).userId = usuario_id;

  const guestIdToSend =
    typeof guestId === "string" && guestId.trim() ? guestId : guestIdFromMiddleware;
  if (typeof guestIdToSend === "string") (params as any).guestId = guestIdToSend;

  // Modo JSON (sem stream): executa e devolve conteúdo agregado
  if (!wantsStream) {
    try {
      const result = await getEcoResponse(params as any);
      const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
      log.info("[ask-eco] JSON response", {
        mode: "json",
        hasContent: textOut.length > 0,
      });
      // NÃO retornamos 'raw' para não vazar metadados/blocos
      return res.status(200).json({ content: textOut || null });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error?.message ?? error);
      log.error("[ask-eco] JSON error", { message });
      return res.status(500).json({ error: message || "Erro interno" });
    }
  }

  // ===== SSE =====

  // Headers SSE (CORS vem do middleware global; aqui reforço útil p/ proxies)
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Expose-Headers", "X-Guest-Id, Content-Type, Cache-Control");
  res.setHeader("Vary", "Origin");
  if (guestIdFromMiddleware) res.setHeader("x-guest-id", guestIdFromMiddleware);

  (res as any).flushHeaders?.();

  const state = {
    done: false,
    sawChunk: false,
    finishReason: "" as string | undefined,
    clientClosed: false,
  };

  const isWritable = () => {
    if (state.clientClosed || state.done) return false;
    if ((res as any).writableEnded || (res as any).writableFinished) return false;
    if ((res as any).destroyed) return false;
    return true;
  };

  const safeWrite = (payload: string) => {
    if (!isWritable()) return;
    try {
      res.write(payload);
    } catch {
      state.clientClosed = true;
    }
  };

  const sendReady = () => {
    log.info("[ask-eco] SSE ready", {
      origin,
      guestId: guestIdFromMiddleware ?? guestIdToSend ?? null,
    });
    // prelude + evento ready
    safeWrite(": ok\n\n");
    safeWrite("event: ready\ndata: {}\n\n");
  };

  const sendChunk = (piece: string) => {
    if (!piece || typeof piece !== "string") return;
    const cleaned = sanitizeOutput(piece);
    if (!cleaned) return;
    state.sawChunk = true;
    log.info("[ask-eco] SSE chunk", { size: cleaned.length });
    safeWrite(`data: ${JSON.stringify({ delta: { content: cleaned } })}\n\n`);
  };

  const sendError = (message: string) => {
    log.error("[ask-eco] SSE error", { message });
    safeWrite(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
  };

  const sendDone = (reason?: string | null) => {
    if (state.done) return;
    state.finishReason = reason ?? state.finishReason ?? "unknown";
    log.info("[ask-eco] SSE done", {
      finishReason: state.finishReason || "unknown",
      sawChunk: state.sawChunk,
    });
    state.done = true;

    if (state.clientClosed) return;
    try {
      res.write("data: [DONE]\n\n");
    } catch {
      state.clientClosed = true;
    }
    try {
      res.end();
    } catch {
      /* noop */
    }
  };

  // Heartbeat a cada 15s
  const heartbeat = setInterval(() => {
    try {
      safeWrite(`: ping ${Date.now()}\n\n`);
    } catch {
      // se der exceção, na próxima checagem writable paramos
    }
  }, 15_000);

  sendReady();

  req.on("close", () => {
    if (state.done) return;
    state.clientClosed = true;
    state.done = true;
    clearInterval(heartbeat);
    log.warn("[ask-eco] SSE client closed", {
      origin,
      guestId: guestIdFromMiddleware ?? guestIdToSend ?? null,
    });
  });

  const forwardEvent = (rawEvt: EcoStreamEvent | any) => {
    if (state.done || state.clientClosed) return;
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
        sendError(message);
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
        // Fallback: se não veio stream, tenta extrair texto do result
        const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
        if (textOut) sendChunk(textOut);
        sendDone(textOut ? "fallback_no_stream" : "fallback_empty");
      } else {
        sendDone("stream_done");
      }
    }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error?.message ?? error);
    const code = (error?.code || error?.status || error?.name || "").toString();
    const details =
      (error?.response?.data ??
        error?.response ??
        error?.data ??
        error?.stack ??
        null);
    log.error("[ask-eco] pipeline error", { message, code, details });
    sendError(code ? `${code}: ${message}` : message || "Erro desconhecido");
    sendDone("error");
  } finally {
    clearInterval(heartbeat);
  }
});

export default router;
