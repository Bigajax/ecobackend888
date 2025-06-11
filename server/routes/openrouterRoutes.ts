import express from "express";
import { supabase } from "../lib/supabaseClient";
import { getEcoResponse } from "../services/ecoCortex";

const router = express.Router();

router.post("/ask-eco", async (req, res) => {
  const { usuario_id, mensagem, mensagens, nome_usuario } = req.body;

  if (!usuario_id || (!mensagem && !mensagens)) {
    return res.status(400).json({ error: "usuario_id e mensagens são obrigatórios." });
  }

  try {
    // 1. Busca o usuário na tabela 'usuarios'
    const { data: usuarioData } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", usuario_id)
      .maybeSingle();

    if (!usuarioData) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // 2. Busca memórias com intensidade > 7 como contexto
    const { data: memoriasContexto } = await supabase
      .from("memories")
      .select("resumo_eco, emocao_principal, dominio_vida")
      .eq("usuario_id", usuario_id)
      .gte("intensidade", 7)
      .order("data_registro", { ascending: false })
      .limit(5);

    const contexto = memoriasContexto?.map(mem =>
      `(${mem.dominio_vida}) ${mem.resumo_eco} [${mem.emocao_principal}]`
    ).join("\n");

    const mensagensParaIA = [
      {
        role: "system",
        content: `Estas são memórias recentes do usuário que podem servir como contexto emocional:\n${contexto}`,
      },
      ...(mensagens || [{ role: "user", content: mensagem }]),
    ];

    // 3. Chama a IA Eco
    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: usuarioData.nome || nome_usuario,
    });

    // 4. Se intensidade > 7, salva a memória
    const intensidade = resposta.intensidade || 0;
    if (intensidade > 7) {
      const { error } = await supabase.from("memories").insert([
        {
          usuario_id,
          resumo_eco: resposta.resumo || resposta.message,
          emocao_principal: resposta.emocao,
          intensidade: intensidade,
          categoria: resposta.tags?.join(','),
          data_registro: new Date().toISOString(),
          salvar_memoria: true,
        }
      ]);
      if (error) {
        console.warn("⚠️ Erro ao salvar memória:", error.message);
      }
    }

    return res.status(200).json({ message: resposta.message });

  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err.message || err);
    return res.status(500).json({ error: "Erro interno ao processar a requisição." });
  }
});

export default router;
