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

  // Utilitário: envia "event: <name>\n data: <json>\n\n"
  const sendEvent = (name: string, payload?: any) => {
    if (finished) return;
    res.write(`event: ${name}\n`);
    res.write(`data: ${payload === undefined ? "{}" : JSON.stringify(payload)}\n\n`);
    if (name === "done") sawDone = true;
  };

  // Converte eventos do orquestrador em nomes SSE esperados pelo front
  const forwardEvent = (evt: EcoStreamEvent) => {
    if (finished) return;

    switch (evt.type) {
      case "control": {
        const name = (evt as any).name;
        if (name === "prompt_ready") {
          sendEvent("prompt_ready", { ok: true });
        } else if (name === "done") {
          sendEvent("done", (evt as any).meta ?? { done: true });
        }
        return;
      }

      case "delta":
      case "token":
      case "chunk": {
        const delta =
          (evt as any).delta ??
          (evt as any).content ??
          (evt as any).text ??
          (evt as any).message;
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
        const metadata = (evt as any).metadata ?? evt;
        sendEvent(evt.type === "meta" ? "meta" : "meta_pending", { metadata });
        return;
      }

      case "memory_saved": {
        const memory = (evt as any).memory ?? (evt as any).memoria ?? evt;
        sendEvent("memory_saved", memory);
        return;
      }

      case "latency": {
        const value = (evt as any).value ?? (evt as any).latencyMs;
        sendEvent("latency", { value });
        return;
      }

      case "error": {
        const errorPayload =
          (evt as any).error ?? { message: (evt as any).message || "Erro desconhecido" };
        sendEvent("error", { error: errorPayload });
        return;
      }

      // Se algum produtor já enviar exatamente esses types
      case "prompt_ready": {
        sendEvent("prompt_ready", { ok: true });
        return;
      }
      case "first_token": {
        const delta =
          (evt as any).delta ?? (evt as any).content ?? (evt as any).text ?? "";
        if (typeof delta === "string" && delta) {
          firstTokenSent = true;
          sendEvent("first_token", { delta });
        }
        return;
      }
      case "done": {
        sendEvent("done", (evt as any).meta ?? { done: true });
        return;
      }

      default: {
        // Silenciosamente ignora outros tipos
        return;
      }
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

    const stream: EcoStreamHandler = {
      onEvent: (event) => forwardEvent(event),
    };

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

    await getEcoResponse(params as any);

    if (!sawDone) {
      // Fallback garantido
      sendEvent("done", { finishReason: "fallback" });
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
