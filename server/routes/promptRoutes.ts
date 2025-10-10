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

/* -------------------------------------------------------------------------- */
/*                             Utilidades de SSE                              */
/* -------------------------------------------------------------------------- */

function sendSse(res: Response, name: string, payload?: any) {
  // Injeta "type" no JSON do data (o front usa esse campo)
  const body =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { type: name, ...payload }
      : payload === undefined
      ? { type: name }
      : { type: name, value: payload };

  res.write(`event: ${name}\n`);
  res.write(`data: ${JSON.stringify(body)}\n\n`);
}

const TEXT_KEYS = [
  "delta",
  "content",
  "text",
  "message",
  "output_text",
  "outputText",
  "output",
  "answer",
  "resposta",
  "respostaFinal",
  "reply",
  "fala",
  "speech",
  "response",
  "final",
  "resultText",
];

/** Varre objetos/arrays e tenta achar a primeira string útil */
function extractText(anyObj: any): string | undefined {
  if (!anyObj) return;
  if (typeof anyObj === "string") return anyObj.trim() || undefined;

  const seen = new Set<any>();
  const stack: any[] = [anyObj];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    // chaves diretas
    for (const k of TEXT_KEYS) {
      if (k in cur) {
        const v = (cur as any)[k];
        if (typeof v === "string" && v.trim()) return v;
      }
    }

    // aninhados comuns
    if ("data" in cur) stack.push((cur as any).data);
    if ("payload" in cur) stack.push((cur as any).payload);
    if ("value" in cur) stack.push((cur as any).value);
    if ("result" in cur) stack.push((cur as any).result);
    if ("meta" in cur) stack.push((cur as any).meta);
    if ("response" in cur) stack.push((cur as any).response);
    if ("message" in cur) stack.push((cur as any).message);
    if ("mensagem" in cur) stack.push((cur as any).mensagem);
    if ("resposta" in cur) stack.push((cur as any).resposta);

    if (Array.isArray((cur as any).choices)) {
      for (const ch of (cur as any).choices) stack.push(ch);
    }
  }
  return;
}

/* -------------------------------------------------------------------------- */
/*                             Rota principal SSE                             */
/* -------------------------------------------------------------------------- */

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
  let sentAnyText = false;

  const endSafely = () => {
    if (finished) return;
    finished = true;
    try { res.end(); } catch {}
  };

  const sendEvent = (name: string, payload?: any) => {
    if (finished) return;
    sendSse(res, name, payload);
    if (name === "done") sawDone = true;
  };

  // Helper para emitir chunk/first_token a partir de uma fonte qualquer
  const tryEmitText = (src: any): boolean => {
    const delta = extractText(src);
    if (typeof delta === "string" && delta.length > 0) {
      if (!firstTokenSent) {
        sendEvent("first_token", { delta });
        firstTokenSent = true;
      } else {
        sendEvent("chunk", { delta });
      }
      sentAnyText = true;
      return true;
    }
    return false;
  };

  const forwardEvent = (rawEvt: EcoStreamEvent | any) => {
    if (finished) return;

    const evt = rawEvt as any;
    const t = evt && typeof evt === "object" ? String(evt.type || "") : "";

    // ▶️ Robustez: eventos sem tipo ou string pura
    if (!t) {
      if (tryEmitText(evt) || tryEmitText(evt?.data) || tryEmitText(evt?.payload)) return;
      return; // sem texto → ignora silenciosamente
    }

    switch (t) {
      case "control": {
        const name = evt?.name;
        if (name === "prompt_ready") {
          sendEvent("prompt_ready", { ok: true });
        } else if (name === "done") {
          // veremos "done" novamente via wrapper, mas não tem problema duplicar
          sendEvent("done", evt?.meta ?? { done: true });
        }
        return;
      }

      case "delta":
      case "token":
      case "chunk": {
        if (tryEmitText(evt) || tryEmitText(evt?.data) || tryEmitText(evt?.payload)) return;
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

      case "prompt_ready": {
        sendEvent("prompt_ready", { ok: true });
        return;
      }

      case "first_token": {
        if (tryEmitText(evt)) return;
        return;
      }

      case "done": {
        sendEvent("done", evt?.meta ?? { done: true });
        return;
      }

      default:
        return;
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

    // Sinaliza prontidão para o front
    sendEvent("prompt_ready", { ok: true });

    const bearer =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;

    const stream: EcoStreamHandler = {
      onEvent: (event) => {
        // Garante fallback textual se o produtor finalizar sem tokens
        if (event?.type === "control" && (event as any).name === "done") {
          if (!sentAnyText) {
            tryEmitText(event) || tryEmitText((event as any).meta) || sendEvent("chunk", { delta: "…" });
            sentAnyText = true;
          }
          sendEvent("done", (event as any).meta ?? { done: true });
          return;
        }
        forwardEvent(event);
      },
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
      (typeof guestId === "string" && guestId.trim())
        ? guestId
        : guestIdFromMiddleware;
    if (typeof guestIdToSend === "string") params.guestId = guestIdToSend;

    await getEcoResponse(params as any);

    // Fallback extra: se não chegou "done" por algum motivo
    if (!sawDone) {
      if (!sentAnyText) sendEvent("chunk", { delta: "…" });
      sendEvent("done", { finishReason: "fallback" });
    }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : (err?.message || "Erro desconhecido");
    sendEvent("error", { error: { message } });
    if (!sawDone) sendEvent("done", { finishReason: "error" });
  } finally {
    clearInterval(ping);
    setTimeout(() => {
      try { res.end(); } catch {}
    }, 10);
  }
});

export default router;
