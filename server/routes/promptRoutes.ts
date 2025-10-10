// server/routes/promptRoutes.ts
import { Router, type Request, type Response } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";
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
  // Headers SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const origin = (req.headers.origin as string) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Guest-Id, X-Guest-Mode"
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Guest-Id, Content-Type, Cache-Control");
  res.setHeader("Vary", "Origin");

  // Propaga guest id (se houver)
  const guestIdFromMiddleware: string | undefined = (req as any)?.guest?.id || undefined;
  if (guestIdFromMiddleware) res.setHeader("x-guest-id", guestIdFromMiddleware);

  // @ts-ignore
  if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

  // Heartbeat
  const ping = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {}
  }, 20_000);

  let finished = false;
  let sawDone = false;
  let firstTokenSent = false;

  const endSafely = () => {
    if (finished) return;
    finished = true;
    try { res.end(); } catch {}
  };

  /** Envia SSE como:
   *  event: <name>
   *  data: {"type":"<name>", ...}
   */
  const sendEvent = (name: string, payload?: any) => {
    if (finished) return;
    const dataObj =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? { type: name, ...payload }
        : payload === undefined
        ? { type: name }
        : { type: name, value: payload };
    res.write(`event: ${name}\n`);
    res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
    if (name === "done") sawDone = true;
  };

  // Traduz eventos internos -> SSE esperados pelo front
  const forwardEvent = (rawEvt: EcoStreamEvent | any) => {
    if (finished) return;
    const evt = rawEvt as any;
    const t = String(evt?.type || "");

    switch (t) {
      case "control": {
        const name = evt?.name;
        if (name === "prompt_ready") sendEvent("prompt_ready", { ok: true });
        else if (name === "done") sendEvent("done", evt?.meta ?? { done: true });
        return;
      }

      case "delta":
      case "token":
      case "chunk": {
        const delta = evt?.delta ?? evt?.content ?? evt?.text ?? evt?.message;
        if (typeof delta === "string" && delta.length > 0) {
          if (!firstTokenSent) {
            sendEvent("first_token", { delta });
            firstTokenSent = true;
          } else {
            sendEvent("chunk", { delta });
          }
        }
        return;
      }

      case "meta":
      case "meta_pending":
      case "meta-pending": {
        const metadata = evt?.metadata ?? evt;
        sendEvent(t === "meta" ? "meta" : "meta_pending", { metadata });
        return;
      }

      case "memory_saved": {
        const memory = evt?.memory ?? evt?.memoria ?? evt;
        sendEvent("memory_saved", memory);
        return;
      }

      case "latency": {
        const value = evt?.value ?? evt?.latencyMs;
        sendEvent("latency", { value });
        return;
      }

      case "error": {
        const errorPayload = evt?.error ?? { message: evt?.message || "Erro desconhecido" };
        sendEvent("error", { error: errorPayload });
        return;
      }

      // já no formato certo
      case "prompt_ready":
        sendEvent("prompt_ready", { ok: true });
        return;

      case "first_token": {
        const delta = evt?.delta ?? evt?.content ?? evt?.text ?? "";
        if (typeof delta === "string" && delta) {
          firstTokenSent = true;
          sendEvent("first_token", { delta });
        }
        return;
      }

      case "done":
        sendEvent("done", evt?.meta ?? { done: true });
        return;

      default:
        return; // ignora
    }
  };

  req.on("close", () => {
    clearInterval(ping);
    if (!sawDone) sendEvent("done", { finishReason: "client_closed" });
    endSafely();
  });

  try {
    const {
      mensagens,
      nome_usuario,
      usuario_id,
      clientHour,
      isGuest,
      guestId,
      sessionMeta,
    } = (req.body ?? {}) as Record<string, any>;

    // Sinaliza prontidão
    sendEvent("prompt_ready", { ok: true });

    const bearer =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;

    const stream: EcoStreamHandler = { onEvent: (event) => forwardEvent(event) };

    // Monta params defensivamente
    const params: Record<string, unknown> = {
      messages: Array.isArray(mensagens) ? mensagens : [],
      stream,
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
      (typeof guestId === "string" && guestId.trim()) ? guestId : guestIdFromMiddleware;
    if (typeof guestIdToSend === "string") params.guestId = guestIdToSend;

    // === Chamada ao orquestrador ===
    const result = await getEcoResponse(params as any);

    // Se ninguém emitiu "done"/tokens (ex.: atalho/full sem stream),
    // fazemos o BRIDGE-FALLBACK: extraímos texto do retorno e emitimos.
    if (!sawDone) {
      const text = extractTextLoose(result);
      if (typeof text === "string" && text.trim()) {
        sendEvent("first_token", { delta: text });
      }
      sendEvent("done", { finishReason: text ? "bridge_fallback" : "fallback" });
    }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : (err?.message || "Erro desconhecido");
    sendEvent("error", { error: { message } });
    if (!sawDone) sendEvent("done", { finishReason: "error" });
  } finally {
    clearInterval(ping);
    setTimeout(endSafely, 10);
  }
});

export default router;
