import { Router, type Request, type Response } from "express";
import { createSSE } from "../utils/sse";
import { streamClaudeChatCompletion, claudeChatCompletion } from "../core/ClaudeAdapter";

type Normalized = {
  clientMessageId: string;
  userText: string;
  usuarioId?: string | null;
};

function normalizePayload(body: any, headers: any): Normalized {
  const cid =
    body?.client_message_id ??
    body?.clientMessageId ??
    headers?.["x-client-message-id"] ??
    "NO-CID";

  let userText = body?.texto;
  if (!userText && Array.isArray(body?.messages) && body.messages.length > 0) {
    const last = body.messages[body.messages.length - 1];
    if (last?.role === "user" && typeof last?.content === "string") {
      userText = last.content;
    }
  }

  const usuarioId = body?.usuario_id ?? headers?.["x-eco-user-id"] ?? null;
  return {
    clientMessageId: String(cid ?? "NO-CID"),
    userText: typeof userText === "string" ? userText : "",
    usuarioId: typeof usuarioId === "string" ? usuarioId : null,
  };
}

export async function askEcoHandler(req: Request, res: Response) {
  const acceptsSse = req.headers.accept === "text/event-stream";

  if (!acceptsSse) {
    const { userText } = normalizePayload(req.body ?? {}, req.headers);
    if (!userText.trim()) {
      return res.status(400).json({ error: "Entrada inválida: faltou texto do usuário." });
    }
    try {
      const response = await claudeChatCompletion({
        messages: [{ role: "user", content: userText }],
      });
      return res.json(response);
    } catch (error) {
      console.error("[ask-eco][non-sse] internal_error", { error });
      return res.status(500).json({ error: "Falha interna ao processar a resposta da IA." });
    }
  }

  const sse = createSSE(res, req);
  const promptReadyTime = Date.now();
  let fallbackEmitted = false;
  let providerWillStart = true; // Assumindo que o provider será iniciado

  console.log(`[ask-eco] Request received`, {
    interaction_id: sse.interaction_id,
    transport: "POST",
    acceptsSse,
    providerWillStart,
  });

  sse.open();

  const { clientMessageId, userText } = normalizePayload(req.body ?? {}, req.headers);
  sse.prompt_ready({ client_message_id: clientMessageId });

  if (!userText.trim()) {
    sse.chunk({ error: true, message: "Entrada inválida: faltou texto do usuário." });
    sse.done({ ok: false, reason: "invalid_input" });
    return sse.end();
  }

  let chunkCounter = 0;
  let firstTokenTime: number | null = null;

  try {
    // await buildPromptContext(...) - Simulação de contexto

    await streamClaudeChatCompletion(
      {
        messages: [{ role: "user", content: userText }],
      },
      {
        onChunk: ({ content }) => {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
            console.log(`[ask-eco] First token received`, {
              interaction_id: sse.interaction_id,
              firstTokenLatencyMs: firstTokenTime - promptReadyTime,
              sincePromptReadyMs: firstTokenTime - promptReadyTime,
            });
          }
          if (content) {
            chunkCounter++;
            sse.chunk({ text: content });
          }
        },
        onControl: (event) => {
          if (event.type === "done") {
            if (chunkCounter === 0) {
              sse.done({ ok: false, reason: "no_chunks_emitted", guardFallback: fallbackEmitted });
            } else {
              sse.done({ ok: true, reason: event.finishReason ?? "stop", guardFallback: fallbackEmitted });
            }
          }
        },
        onError: (error) => {
          console.error("[ask-eco] stream_error", { interaction_id: sse.interaction_id, error });
          sse.chunk({ error: true, message: "Falha na comunicação com a IA." });
        },
        onFallback: (model) => {
          fallbackEmitted = true;
          console.log(`[ask-eco] Fallback to model ${model} triggered`, { 
            interaction_id: sse.interaction_id,
            fallbackEmitted,
          });
        },
      },
      { signal: req.signal } // Propaga o AbortSignal do cliente
    );
  } catch (error) {
    console.error("[ask-eco] internal_error", {
      interaction_id: sse.interaction_id,
      error,
    });
    sse.chunk({ error: true, message: "Falha interna ao processar a resposta da IA." });
    sse.done({ ok: false, reason: "internal_error", guardFallback: fallbackEmitted });
  } finally {
    sse.end();
  }
}

const router = Router();

router.head("/ask-eco", (_req, res) => {
  res.sendStatus(200);
});

router.post("/ask-eco", askEcoHandler);

export default router;