import express from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getEcoResponse } from "../services/ecoCortex";
import { embedTextoCompleto } from "../services/embeddingService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias"; // helper já atualizado

const router = express.Router();

router.post("/ask-eco", async (req, res) => {
  const { usuario_id, mensagem, messages, mensagens, nome_usuario } = req.body;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }
  const token = authHeader.replace("Bearer ", "").trim();

  const mensagensParaIA =
    messages ||
    mensagens ||
    (mensagem ? [{ role: "user", content: mensagem }] : null);

  if (!usuario_id || !mensagensParaIA) {
    return res
      .status(400)
      .json({ error: "usuario_id e messages são obrigatórios." });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res
        .status(401)
        .json({ error: "Token inválido ou usuário não encontrado." });
    }

    // 1) Embedding da última mensagem (só se fizer sentido)
    const ultimaMsg = mensagensParaIA.at(-1)?.content ?? "";
    let queryEmbedding: number[] | undefined = undefined;
    if (typeof ultimaMsg === "string" && ultimaMsg.trim().length >= 6) {
      try {
        queryEmbedding = await embedTextoCompleto(ultimaMsg);
      } catch (e) {
        console.warn("⚠️ Falha ao gerar embedding da última mensagem:", (e as Error)?.message);
      }
    }

    // 2) Buscar memórias similares (usa embedding se houver, senão cai no texto)
    let memsSimilares: any[] = [];
    try {
      memsSimilares = await buscarMemoriasSemelhantes(usuario_id, {
        userEmbedding: queryEmbedding,
        texto: queryEmbedding ? undefined : ultimaMsg,
        k: 5,
      });
      console.log("[ℹ️] Memórias semelhantes retornadas:", memsSimilares);
    } catch (memErr) {
      console.warn("[ℹ️] Falha na busca de memórias semelhantes:", (memErr as Error)?.message);
    }

    // 3) Chama UMA VEZ o getEcoResponse (Opção A já aplica/força VIVA internamente quando precisar)
    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token,
      mems: memsSimilares,
    });

    // Você pode retornar apenas a mensagem...
    // return res.status(200).json({ message: resposta.message });

    // ...ou toda a estrutura (mensagem + metadados) se o frontend já aproveitar:
    return res.status(200).json(resposta);
  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err);
    return res.status(500).json({
      error: "Erro interno ao processar a requisição.",
      details: {
        message: err?.message,
        stack: err?.stack,
      },
    });
  }
});

export default router;
