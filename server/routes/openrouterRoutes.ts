import express from "express";
import { supabase } from "../lib/supabaseClient";
import { getEcoResponse } from "../services/ecoCortex";

const router = express.Router();

router.post("/ask-eco", async (req, res) => {
  const { usuario_id, mensagem, mensagens, nome_usuario, access_token } = req.body;

  if (!usuario_id || (!mensagem && !mensagens)) {
    return res.status(400).json({ error: "usuario_id e mensagens são obrigatórios." });
  }

  if (!access_token) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }

  try {
    const mensagensParaIA = mensagens || [{ role: "user", content: mensagem }];

    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: access_token
    });

    return res.status(200).json({ message: resposta.message });

  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err.message || err);
    return res.status(500).json({ error: "Erro interno ao processar a requisição." });
  }
});

export default router;
