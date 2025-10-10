// server/routes/promptRoutes.ts
import { Router, type Request, type Response } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";

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
 * Stream SSE com resposta da Eco. Garante envio de 'done' sempre.
 */
router.post("/ask-eco", async (req: Request, res: Response) => {
  // Configuração essencial para SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // CORS de segurança
  const origin = (req.headers.origin as string) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Guest-Id, X-Guest-Mode"
  );
  res.setHeader("Vary", "Origin");

  // devolve guest id (se existir)
  if ((req as any).guest?.id) {
    res.setHeader("x-guest-id", (req as any).guest.id);
  }

  // inicia o stream
  // @ts-ignore
  if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

  let finished = false;
  const endSafely = () => {
    if (finished) return;
    finished = true;
    try {
      res.end();
    } catch {}
  };

  // helpers SSE
  const send = (type: string, payload: unknown) => {
    if (finished) return;
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };
  const sendError = (message: string) => send("error", { error: String(message) });
  const sendDone = (payload: unknown = {}) => send("done", payload);

  // encerra se o cliente fechar
  req.on("close", () => endSafely());

  try {
    // corpo recebido
    const {
      mensagens,
      nome_usuario,
      clientHour,
      clientTz,
      isGuest,
      guestId,
      usuario_id,
    } = (req.body ?? {}) as Record<string, any>;

    // confirma início
    send("prompt_ready", { ok: true });

    // ==========================================
    // TODO: substitua pelo fluxo real da LLM.
    // Exemplo simples de stream:
    await new Promise((r) => setTimeout(r, 80));
    send("first_token", { delta: "Olá" });
    await new Promise((r) => setTimeout(r, 80));
    send("chunk", { delta: ", tudo " });
    await new Promise((r) => setTimeout(r, 80));
    send("chunk", { delta: "bem?" });
    // ==========================================

    const metadata = {
      userName: nome_usuario ?? null,
      guest: Boolean(isGuest),
      guestId: guestId ?? (req as any).guest?.id ?? null,
      tz: clientTz ?? null,
      hour: clientHour ?? null,
      userId: usuario_id ?? null,
    };

    // ✅ sempre finaliza corretamente
    sendDone({ response: { content: "Fluxo finalizado com sucesso." }, metadata });
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao gerar resposta da Eco.";
    sendError(msg);
    sendDone({ error: msg });
  } finally {
    setTimeout(endSafely, 10);
  }
});

export default router;
