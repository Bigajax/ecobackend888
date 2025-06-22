import express from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getEcoResponse } from "../services/ecoCortex";
import { embedTextoCompleto } from "../services/embeddingService"; // ⬅️ novo

const router = express.Router();

// 🔒 POST /api/ask-eco → Envia mensagens para a IA
router.post("/ask-eco", async (req, res) => {
  const {
    usuario_id,
    mensagem,
    messages,   // front-end atual
    mensagens,  // legado
    nome_usuario,
  } = req.body;

  // 🔐 Extrai token do header Authorization
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }
  const token = authHeader.replace("Bearer ", "").trim();

  // ✅ Normaliza as mensagens recebidas
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
    // 🔐 Valida o token & obtém usuário
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res
        .status(401)
        .json({ error: "Token inválido ou usuário não encontrado." });
    }

    /* ------------------------------------------------------------------ */
    /*              🔎 1. gera embedding da última mensagem               */
    /* ------------------------------------------------------------------ */
    const ultimaMsg = mensagensParaIA.at(-1)?.content ?? "";
    const queryEmbedding = await embedTextoCompleto(ultimaMsg);

    /* ------------------------------------------------------------------ */
    /*      🔍 2. busca no Supabase as memórias semanticamente afins      */
    /* ------------------------------------------------------------------ */
    let memsSimilares: any[] = [];
    if (queryEmbedding) {
      const { data: memData, error: memErr } =
        await supabaseAdmin.rpc("buscar_memorias_semelhantes", {
          consulta_embedding: queryEmbedding,
          filtro_usuario: usuario_id,
          limite: 5,
        });
      if (memErr) {
        console.warn("[ℹ️] Falha na busca de memórias semelhantes:", memErr);
      } else {
        memsSimilares = memData || [];
        // 🔍 LOG para depuração
        console.log("[ℹ️] Memórias semelhantes retornadas:", memsSimilares);
      }
    }

    /* ------------------------------------------------------------------ */
    /*     🤖 3. chama a IA já com as memórias relevantes no contexto     */
    /* ------------------------------------------------------------------ */
    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      accessToken: token,
      mems: memsSimilares,           // ⬅️ novo parâmetro
    });

    return res.status(200).json({ message: resposta.message });
  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err.message || err);
    return res.status(500).json({
      error: "Erro interno ao processar a requisição.",
    });
  }
});

export default router;
