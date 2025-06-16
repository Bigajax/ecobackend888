import express from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getEcoResponse } from "../services/ecoCortex";

const router = express.Router();

// 🔒 POST /api/ask-eco → Envia mensagens para a IA
router.post("/ask-eco", async (req, res) => {
  const {
    usuario_id,
    mensagem,
    messages,        // <- usado pelo front-end moderno
    mensagens,       // <- compatibilidade com versões antigas (opcional)
    nome_usuario
  } = req.body;

  // 🔐 Extrai token do header Authorization
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }
  const token = authHeader.replace("Bearer ", "").trim();

  // ✅ Usa o campo disponível entre 'messages', 'mensagens' ou 'mensagem'
  const mensagensParaIA =
    messages || mensagens || (mensagem ? [{ role: "user", content: mensagem }] : null);

  if (!usuario_id || !mensagensParaIA) {
    return res
      .status(400)
      .json({ error: "usuario_id e messages são obrigatórios." });
  }

  try {
    // 🔐 Verifica usuário com o token
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res
        .status(401)
        .json({ error: "Token inválido ou usuário não encontrado." });
    }

    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token
    });

    return res.status(200).json({ message: resposta.message });
  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err.message || err);
    return res.status(500).json({
      error: "Erro interno ao processar a requisição."
    });
  }
});

export default router;
