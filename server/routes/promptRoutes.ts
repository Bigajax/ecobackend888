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
        const t = tryList(val[k]);
        if (t) return t;
      }
      // paths comuns
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
      // choices estilo OpenAI/Claude
      if (Array.isArray((val as any).choices)) {
        for (const c of (val as any).choices) {
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

/** Normaliza o corpo para um array de mensagens {role, content} */
function normalizeMessages(body: any): Array<{ role: string; content: string }> {
  const { messages, mensagens, mensagem, text } = body || {};

  let arr: any[] | null = null;

  if (Array.isArray(messages)) arr = messages;
  else if (Array.isArray(mensagens)) arr = mensagens;
  else if (typeof mensagem === "string" && mensagem.trim()) arr = [{ role: "user", content: mensagem }];
  else if (typeof text === "string" && text.trim()) arr = [{ role: "user", content: text }];

  if (!arr) return [];

  return arr
    .map((m) => {
      const role = typeof m?.role === "string" ? m.role : "user";
      const content =
        typeof m?.content === "string"
          ? m.content
          : m?.content != null
          ? String(m.content)
          : "";
      return { role, content };
    })
    .filter((m) => m.content.trim().length > 0);
}

/** POST /api/ask-eco — stream SSE */
router.post("/ask-eco", async (req: Request, res: Response) => {
  // SSE só se cliente PEDIR explicitamente
  const accept = String(req.headers.accept || "").toLowerCase();
  const wantsStream = accept.includes("text/event-stream");

  const origin = (req.headers.origin as string) || "*";
  const guestIdFromMiddleware: string | undefined = (req as any)?.guest?.id || undefined;

  const body = (req.body ?? {}) as Record<string, any>;
  const mensagens = normalizeMessages(body);

  const {
    nome_usuario,
    usuario_id,
    clientHour,
    isGuest,
    guestId,
    sessionMeta,
  } = body;

  const bearer =
    req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;

  // Validação mínima para evitar 500 opaco
  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    return res.status(400).json({
      error:
        "Corpo inválido. Envie 'mensagens' (array de {role, content}) ou 'text'/'mensagem' (string).",
      exemplo: {
        mensagens: [{ role: "user", content: "Olá!" }],
        OU: { text: "Olá!" },
        OU2: { mensagem: "Olá!" },
      },
    });
  }

  // Montagem de params base
  const params: Record<string, unknown> = {
    messages: mensagens,
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

  // Modo JSON (sem stream): executa e devolve conteúdo agregado
  if (!wantsStream) {
    try {
      const result = await getEcoResponse(params as any);
      const textOut = extractTextLoose(result) ?? "";
      log.info("[ask-eco] JSON response", {
        mode: "json",
        hasContent: textOut.length > 0,
      });
      return res.status(200).json({ content: textOut || null, raw: result });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error?.message ?? error);
      log.error("[ask-eco] JSON error", { message });
      return res.status(500).json({ error: message || "Erro interno" });
    }
  }

  // SSE headers (adiciona reflect do Origin para stream estável sob proxies)
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
    finishReason: "" as string | undefined,
    clientClosed: false,
  };

  const heartbeat = setInterval(() => {
    try {
      res.write(`:ka\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 15_000);

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

  const sendDone = (reason?: string | null) => {
    if (state.done) return;
    state.finishReason = reason ?? state.finishReason ?? "unknown";
    log.info("[ask-eco] SSE done", {
      finishReason: state.finishReason || "unknown",
      sawChunk: state.sawChunk,
    });
    state.done = true;

    if (state.clientClosed) {
      clearInterval(heartbeat);
      return;
    }

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
    clearInterval(heartbeat);
  };

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
      default: {
        // Alguns adapters não setam "type", mas enviam { text|content|delta }
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
      const textOut = extractTextLoose(result);
      if (typeof textOut === "string" && textOut.trim()) {
        sendChunk(textOut);
      }
      sendDone(textOut ? "bridge_fallback" : "fallback");
    }
  } catch (error: any) {
    // log mais informativo para decifrar 500 do adapter
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
  }
});

export default router;
