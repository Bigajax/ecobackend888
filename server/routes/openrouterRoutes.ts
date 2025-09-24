import express from "express";
import supabaseAdmin from "../lib/supabaseAdmin";

import { getEcoResponse } from "../services/ConversationOrchestrator";
import { embedTextoCompleto } from "../services/embeddingService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias";

const router = express.Router();

// log seguro de trechos (evita vazar texto completo em prod)
const safeLog = (s: string) =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";

// normaliza array de mensagens da UI
function normalizarMensagens(body: any): Array<{ role: string; content: any }> | null {
  const { messages, mensagens, mensagem } = body || {};
  if (Array.isArray(messages)) return messages;
  if (Array.isArray(mensagens)) return mensagens;
  if (mensagem) return [{ role: "user", content: mensagem }];
  return null;
}

router.post("/ask-eco", async (req, res) => {
  const { usuario_id, nome_usuario } = req.body;
  const mensagensParaIA = normalizarMensagens(req.body);

  // auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }
  const token = authHeader.replace("Bearer ", "").trim();

  if (!usuario_id || !mensagensParaIA) {
    return res.status(400).json({ error: "usuario_id e messages são obrigatórios." });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Token inválido ou usuário não encontrado." });
    }

    // última mensagem
    const ultimaMsg = String(mensagensParaIA.at(-1)?.content ?? "");
    console.log("🗣️ Última mensagem:", safeLog(ultimaMsg));

    // embedding só quando fizer sentido
    let queryEmbedding: number[] | undefined;
    if (ultimaMsg.trim().length >= 6) {
      try {
        const raw = await embedTextoCompleto(ultimaMsg);
        queryEmbedding = Array.isArray(raw) ? raw : JSON.parse(String(raw));
        if (!Array.isArray(queryEmbedding)) queryEmbedding = undefined;
      } catch (e) {
        console.warn("⚠️ Falha ao gerar embedding:", (e as Error)?.message);
      }
    }

    // threshold adaptativo para recall melhor
    let threshold = 0.15;
    if (ultimaMsg.trim().length < 20) threshold = 0.10;
    if (/lembr|record|memó/i.test(ultimaMsg)) threshold = Math.min(threshold, 0.12);

    // busca de memórias (helper unificado)
    let memsSimilares: any[] = [];
    try {
      memsSimilares = await buscarMemoriasSemelhantes(usuario_id, {
        userEmbedding: queryEmbedding,
        texto: queryEmbedding ? undefined : ultimaMsg,
        k: 5,
        threshold,
      });
      console.log(
        "🔎 Memórias similares:",
        memsSimilares.map((m) => ({
          id: m.id?.slice(0, 8),
          sim: m.similaridade ?? m.similarity ?? 0,
        }))
      );
    } catch (memErr) {
      console.warn("⚠️ Falha na busca de memórias semelhantes:", (memErr as Error)?.message);
      memsSimilares = [];
    }

    // orquestrador (única chamada)
    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token,
      mems: memsSimilares,
    });

    return res.status(200).json(resposta);
  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err);
    return res.status(500).json({
      error: "Erro interno ao processar a requisição.",
      details: { message: err?.message, stack: err?.stack },
    });
  }
});

export default router;
