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
  let sentDone = false;

  const endSafely = () => {
    if (finished) return;
    finished = true;
    try {
      res.end();
    } catch {}
  };

  // Método único para escrever qualquer evento SSE
  const sseSend = (event: EcoStreamEvent) => {
    if (finished) return;
    // se o pipeline não enviar 'done', teremos fallback no finally
    if (event?.type === "done") sentDone = true;
    // A API do front espera { type, payload } como JSON por linha de evento
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // se o cliente fechar a conexão, encerramos o stream
  req.on("close", () => endSafely());

  try {
    // Extrai o corpo conforme o front envia
    const {
      mensagens,
      nome_usuario,
      clientHour,  // <- este existe no GetEcoParams
      // clientTz,  // <- NÃO existe no GetEcoParams (removido)
      isGuest,
      guestId,
      usuario_id,
      sessionMeta,
    } = (req.body ?? {}) as Record<string, any>;

    // Envia evento inicial
    sseSend({ type: "prompt_ready", payload: { ok: true } });

    // Token Bearer (se houver)
    const bearer =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;

    // Implementa EcoStreamHandler corretamente: SOMENTE onEvent e close
    const stream: EcoStreamHandler = {
      onEvent: (evt) => {
        // evt já vem no formato { type, payload, ... }
        sseSend(evt);
      },
      close: () => endSafely(),
    };

    // Chama o orquestrador no modo streaming
    await getEcoResponse({
      messages: mensagens,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: bearer,
      clientHour,                // OK no tipo
      sessionMeta,
      isGuest: Boolean(isGuest),
      guestId: guestId ?? guestIdFromMiddleware ?? null,
      stream,                   // EcoStreamHandler com onEvent/close
    });

    // Caso extraordinário: pipeline não mandou 'done'
    if (!sentDone) {
      sseSend({
        type: "done",
        payload: { response: { content: "" }, metadata: { fallbackDone: true } },
      });
    }
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao gerar resposta da Eco.";
    // envia erro e mesmo assim finaliza com done
    sseSend({ type: "error", payload: { error: msg } });
    if (!sentDone) {
      sseSend({ type: "done", payload: { error: msg } });
    }
  } finally {
    setTimeout(endSafely, 10);
  }
});

export default router;
