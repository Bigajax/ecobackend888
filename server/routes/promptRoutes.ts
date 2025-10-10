// server/routes/promptRoutes.ts
import { Router, Request, Response } from "express";
import { getEcoResponseOtimizado as getEcoResponse } from "../services/ConversationOrchestrator";
import { log } from "../services/promptContext/logger";

const router = Router();

const writeEvent = (res: Response, obj: unknown) => {
  // Cada evento vai como uma linha "data: <json>\n\n"
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
};

router.get("/prompt-preview", async (req: Request, res: Response) => {
  // (só mantendo sua rota de debug existente)
  try {
    res.status(501).json({ error: "não implementado aqui" });
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: "Erro interno ao montar o prompt." });
  }
});

/**
 * POST /api/ask-eco
 * Body: { mensagens: [{id, role, content}], nome_usuario?, usuario_id?, clientHour?, clientTz?, isGuest?, guestId? }
 * Resposta: SSE (text/event-stream)
 */
router.post("/ask-eco", async (req: Request, res: Response) => {
  // ---- Cabeçalhos SSE essenciais
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Necessário no Render/Nginx para não bufferizar
  res.setHeader("X-Accel-Buffering", "no");

  // Alguns proxies só “abrem” quando mandamos algo:
  // flush imediato dos headers
  // @ts-ignore (Node 18+ ok)
  res.flushHeaders?.();

  // keep-alive ping a cada 20s (evita timeouts no caminho)
  const ping = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      // ignorar
    }
  }, 20_000);

  // Para evitar “done” duplicado
  let finished = false;
  const safeDone = (meta?: Record<string, any>) => {
    if (finished) return;
    finished = true;
    try {
      writeEvent(res, { type: "control", name: "done", meta: meta || {} });
    } catch (e) {
      // noop
    }
    try {
      res.end();
    } catch {
      // noop
    }
  };

  // Se o cliente desconectar, encerramos nossa stream
  req.on("close", () => {
    clearInterval(ping);
    safeDone({ finishReason: "client_closed" });
  });

  try {
    // --------- Leitura do body
    const {
      mensagens = [],
      nome_usuario,
      usuario_id,
      clientHour,
      clientTz,
      isGuest = false,
      guestId = undefined,
    } = (req.body || {}) as {
      mensagens: Array<{ id?: string; role: string; content: string }>;
      nome_usuario?: string;
      usuario_id?: string;
      clientHour?: number;
      clientTz?: string;
      isGuest?: boolean;
      guestId?: string;
    };

    // Envia o “prompt_ready” cedo (ajuda front a trocar estado)
    writeEvent(res, { type: "control", name: "prompt_ready" });

    // Handler que converte eventos do orquestrador no formato SSE:
    const streamHandler = {
      onEvent: (evt: any) => {
        // Normalização de alguns tipos esperados pelo front
        if (evt?.type === "chunk") {
          writeEvent(res, { type: "chunk", content: evt.content ?? "", index: evt.index ?? 0 });
          return;
        }
        if (evt?.type === "control") {
          // meta pendente/concluída
          if (evt.name === "meta_pending") {
            writeEvent(res, { type: "meta_pending" });
            return;
          }
          if (evt.name === "meta") {
            writeEvent(res, { type: "meta", payload: { metadata: evt.meta } });
            return;
          }
          if (evt.name === "memory_saved") {
            writeEvent(res, {
              type: "memory_saved",
              payload: {
                primeiraMemoriaSignificativa: !!evt.meta?.primeiraMemoriaSignificativa,
                memory: {
                  id: evt.meta?.memoriaId,
                  intensidade: evt.meta?.intensidade,
                },
              },
            });
            return;
          }
          if (evt.name === "first_token") {
            writeEvent(res, { type: "first_token" });
            return;
          }
          if (evt.name === "reconnect") {
            writeEvent(res, { type: "control", name: "reconnect", attempt: evt.attempt ?? 1 });
            return;
          }
          // “done” será emitido no finally/safeDone — então ignoramos aqui
          return;
        }
        if (evt?.type === "error") {
          writeEvent(res, {
            type: "error",
            payload: {
              error: evt.error?.message || "stream_error",
            },
          });
          return;
        }

        // Desconhecido → loga e segue
        log.debug("[promptRoutes] evento desconhecido no stream", { evt });
      },
    };

    // Chama o orquestrador no modo streaming
    const result = await getEcoResponse({
      messages: mensagens,
      userId: usuario_id,
      userName: nome_usuario,
      clientHour,
      sessionMeta: { clientTz },
      stream: streamHandler,
      isGuest,
      guestId,
      // accessToken será inferido no adapter (se você usa bearer do supabase)
    });

    // Ao final do streaming, result.finalize() monta o objeto final (se precisar)
    const final = await result.finalize().catch(() => null);

    // Emite “done” com metadados mínimos
    safeDone({
      finishReason: (final as any)?.finishReason ?? null,
      modelo: result?.modelo ?? null,
      usage: result?.usage ?? null,
      length: (final as any)?.text?.length ?? undefined,
    });
  } catch (err: any) {
    log.error("[ask-eco] erro na rota", { message: err?.message, stack: err?.stack });
    // Envia um evento de erro para o front (antes de encerrar)
    try {
      writeEvent(res, {
        type: "error",
        payload: { error: err?.message || "Erro inesperado no servidor" },
      });
    } catch {
      // ignore
    }
    safeDone({ finishReason: "error" });
  } finally {
    clearInterval(ping);
  }
});

export default router;
