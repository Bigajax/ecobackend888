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
  // SSE headers
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
  if (guestIdFromMiddleware) {
    res.setHeader("x-guest-id", guestIdFromMiddleware);
  }

  // @ts-ignore
  if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

  const ping = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {}
  }, 20_000);

  let finished = false;
  let sawDone = false;

  const endSafely = () => {
    if (finished) return;
    finished = true;
    try {
      res.end();
    } catch {}
  };

  const writeEvent = (evt: EcoStreamEvent) => {
    if (finished) return;
    if (evt.type === "control" && (evt as any).name === "done") {
      sawDone = true;
    }
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  req.on("close", () => {
    clearInterval(ping);
    if (!sawDone) {
      writeEvent({ type: "control", name: "done", meta: { finishReason: "client_closed" } as any });
    }
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

    writeEvent({ type: "control", name: "prompt_ready" } as any);

    const bearer =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;

    const stream: EcoStreamHandler = {
      onEvent: (event) => writeEvent(event),
    };

    // monta params de forma defensiva — só adiciona campos presentes
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

    // passa como any para não conflitar com diferenças locais de tipos
    await getEcoResponse(params as any);

    if (!sawDone) {
      writeEvent({
        type: "control",
        name: "done",
        meta: { finishReason: "fallback" } as any,
      });
    }
  } catch (err: any) {
    const errorObj = err instanceof Error ? err : new Error(err?.message || "Erro desconhecido");
    writeEvent({ type: "error", error: errorObj } as any);
    if (!sawDone) {
      writeEvent({
        type: "control",
        name: "done",
        meta: { finishReason: "error" } as any,
      });
    }
  } finally {
    clearInterval(ping);
    setTimeout(endSafely, 10);
  }
});

export default router;
