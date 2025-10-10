// server/routes/promptRoutes.ts
import { Router, type Request, type Response } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";

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
  // HEADERS essenciais para SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // CORS (reforço; createApp já cuida globalmente)
  const origin = (req.headers.origin as string) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Guest-Id, X-Guest-Mode"
  );
  res.setHeader("Vary", "Origin");

  // devolve guest id se o middleware tiver setado
  if ((req as any).guest?.id) {
    res.setHeader("x-guest-id", (req as any).guest.id);
  }

  // flush inicial
  // @ts-ignore
  if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

  let finished = false;
  let sentDone = false;

  const endSafely = () => {
    if (finished) return;
    finished = true;
    try {
      res.end();
    } catch {}
  };

  // helpers SSE
  const sseSend = (type: string, payload: unknown) => {
    if (finished) return;
    if (type === "done") sentDone = true;
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };

  // fecha se cliente desconectar
  req.on("close", () => endSafely());

  try {
    // Extrai parâmetros do body
    const {
      mensagens,
      nome_usuario,
      clientHour,
      clientTz,
      isGuest,
      guestId,
      usuario_id,
      sessionMeta,
    } = (req.body ?? {}) as Record<string, any>;

    // evento inicial
    sseSend("prompt_ready", { ok: true });

    // token de acesso (se houver)
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;

    // Wrapper do handler de stream para garantir 'done' em último caso
    const stream = {
      send: (type: string, payload: unknown) => sseSend(type, payload),
      close: () => endSafely(),
    };

    // Chama o orquestrador em modo streaming
    await getEcoResponse({
      messages: mensagens,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: bearer,
      clientHour,
      clientTz,
      sessionMeta,
      isGuest: Boolean(isGuest),
      guestId: guestId ?? (req as any).guest?.id ?? null,
      stream,
    });

    // Se por qualquer motivo o pipeline não tiver enviado 'done', envia aqui
    if (!sentDone) {
      sseSend("done", { response: { content: "" }, metadata: { fallbackDone: true } });
    }
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao gerar resposta da Eco.";
    sseSend("error", { error: msg });
    if (!sentDone) sseSend("done", { error: msg });
  } finally {
    setTimeout(endSafely, 10);
  }
});

export default router;
