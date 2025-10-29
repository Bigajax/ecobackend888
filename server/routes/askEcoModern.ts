import { Router, type Request, type Response } from "express";

import { createSSE } from "../utils/sse";

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
  const sse = createSSE(res);
  sse.open();

  const { clientMessageId, userText } = normalizePayload(req.body ?? {}, req.headers);
  sse.ready({ client_message_id: clientMessageId });

  if (!userText.trim()) {
    sse.chunk({ error: true, message: "Entrada inválida: faltou texto do usuário." });
    sse.done({ ok: false, reason: "invalid_input" });
    return sse.end();
  }

  try {
    try {
      // await buildPromptContext(...)
    } catch {
      sse.chunk({ warn: true, message: "Contexto indisponível (Supabase). Seguindo sem memórias." });
    }

    const reply = `Eco diz: ${userText}`;
    sse.chunk({ text: reply });
    sse.done({ ok: true });
  } catch (error) {
    console.error("[ask-eco] internal_error", error);
    sse.chunk({ error: true, message: "Falha interna ao processar a resposta da IA." });
    sse.done({ ok: false, reason: "internal_error" });
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
