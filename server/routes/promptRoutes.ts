// server/routes/promptRoutes.ts
import { Router, type Request, type Response } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import type { EcoStreamHandler, EcoStreamEvent } from "../services/conversation/types";

const router = Router();

console.log("Backend: promptRoutes carregado.");

/**
 * GET /api/prompt-preview
 * Retorna o prompt final com base no estado atual (para testes/debug).
 */
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

/**
 * POST /api/ask-eco
 * Stream SSE com resposta da Eco — garante envio de 'done' sempre.
 */
router.post("/ask-eco", async (req: Request, res: Response) => {
  // Cabeçalhos essenciais p/ SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // CORS (reforço; o app já cuida globalmente)
  const origin = (req.headers.origin as string) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Guest-Id, X-Guest-Mode"
  );
  res.setHeader("Vary", "Origin");

  // guest-id normalizado pelo middleware (se houver)
  const guestIdFromMiddleware: string | undefined = (req as any)?.guest?.id || undefined;
  if (guestIdFromMiddleware) {
    res.setHeader("x-guest-id", guestIdFromMiddleware);
  }

  // flush imediato (alguns proxies só “abrem” após isso)
  // @ts-ignore
  if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

  // keep-alive ping
  const ping = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      // ignore
    }
  }, 20_000);

  let finished = false;
  let sawDone = false;

  const endSafely = () => {
    if (finished) return;
    finished = true;
    try {
      res.end();
    } catch {
      // ignore
    }
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
    // fecha com done se ainda não fechou
    if (!sawDone) {
      writeEvent({ type: "control", name: "done", meta: { finishReason: "client_closed" } as any });
    }
    endSafely();
  });

  try {
    // Extrai body
    const {
      mensagens,
      nome_usuario,
      usuario_id,
      clientHour,
      isGuest,
      guestId,       // pode vir undefined
      sessionMeta,   // deve ser um objeto válido p/ passar adiante
    } = (req.body ?? {}) as Record<string, any>;

    // Evento inicial
    writeEvent({ type: "control", name: "prompt_ready" } as any);

    // Bearer (opcional)
    const bearer =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;

    // Handler de stream
    const stream: EcoStreamHandler = {
      onEvent: (event) => {
        writeEvent(event);
      },
    };

    // sessionMeta só se for objeto plain
    const metaToSend =
      sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta)
        ? (sessionMeta as Record<string, any>)
        : undefined;

    // guestId precisa ser string | undefined (NÃO null)
    const guestIdToSend: string | undefined =
      typeof guestId === "string" && guestId.trim()
        ? guestId
        : guestIdFromMiddleware;

    await getEcoResponse({
      messages: Array.isArray(mensagens) ? mensagens : [],
      userId: typeof usuario_id === "string" ? usuario_id : undefined,
      userName: typeof nome_usuario === "string" ? nome_usuario : undefined,
      accessToken: bearer,
      clientHour: typeof clientHour === "number" ? clientHour : undefined,
      sessionMeta: metaToSend,          // ✅ sem clientTz ad-hoc
      isGuest: Boolean(isGuest),
      guestId: guestIdToSend,           // ✅ string | undefined
      stream,                           // ✅ EcoStreamHandler com onEvent
    });

    // fallback: garante 'done' mesmo que pipeline não tenha enviado
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
