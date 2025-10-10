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
  // HEADERS essenciais para SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // CORS (reforço; o createApp já cuida globalmente)
  const origin = (req.headers.origin as string) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Guest-Id, X-Guest-Mode"
  );
  res.setHeader("Vary", "Origin");

  // Devolve guest id (se o middleware tiver setado/normalizado)
  const guestIdFromMiddleware = (req as any).guest?.id;
  if (guestIdFromMiddleware) {
    res.setHeader("x-guest-id", guestIdFromMiddleware);
  }

  // Flush inicial (alguns proxies só abrem o stream após isso)
  // @ts-ignore
  if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

  let finished = false;
  let sawDone = false;

  const endSafely = () => {
    if (finished) return;
    finished = true;
    try {
      res.end();
    } catch {}
  };

  // escritor único de eventos SSE (no formato do seu EcoStreamEvent)
  const writeEvent = (evt: EcoStreamEvent) => {
    if (finished) return;
    if (evt?.type === "control" && (evt as any).name === "done") {
      sawDone = true;
    }
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  // se o cliente fechar a conexão, encerramos o stream
  req.on("close", () => endSafely());

  try {
    // Extrai o corpo conforme o front envia
    const {
      mensagens,
      nome_usuario,
      clientHour,     // <- existe em GetEcoParams
      // clientTz,     // <- NÃO existe em GetEcoParams (não enviar)
      isGuest,
      guestId,
      usuario_id,
      sessionMeta,
    } = (req.body ?? {}) as Record<string, any>;

    // Envia evento inicial no formato do seu tipo (control + name)
    writeEvent({ type: "control", name: "prompt_ready", timings: undefined });

    // Token Bearer (se houver)
    const bearer =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;

    // Implementa EcoStreamHandler APENAS com onEvent
    const stream: EcoStreamHandler = {
      onEvent: (event) => {
        // O orquestrador emitirá EcoStreamEvent já no formato correto;
        // apenas repassamos para o cliente via SSE.
        writeEvent(event);
      },
    };

    // Chama o orquestrador em modo streaming
    await getEcoResponse({
      messages: mensagens,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: bearer,
      clientHour,               // OK no tipo
      sessionMeta,
      isGuest: Boolean(isGuest),
      guestId: guestId ?? guestIdFromMiddleware ?? null,
      stream,                   // EcoStreamHandler com onEvent
    });

    // Caso extraordinário: pipeline não mandou 'done'
    if (!sawDone) {
      writeEvent({ type: "control", name: "done", meta: { finishReason: "fallback" } });
    }
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao gerar resposta da Eco.";
    // envia erro e, mesmo assim, finalize com done no formato correto
    writeEvent({ type: "error", error: err instanceof Error ? err : new Error(msg) });
    if (!sawDone) {
      writeEvent({ type: "control", name: "done", meta: { finishReason: "error" } });
    }
  } finally {
    setTimeout(endSafely, 10);
  }
});

export default router;
