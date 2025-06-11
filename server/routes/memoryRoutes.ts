import express from "express";
import { supabase } from "../lib/supabaseClient";

const router = express.Router();

// POST /api/memorias/registrar → Salva nova memória
router.post("/registrar", async (req, res) => {
  const {
    usuario_id,
    texto,
    tags,
    intensidade,
    mensagem_id,
    emocao_principal,
    contexto,
    dominio_vida,
    padrao_comportamental,
    salvar_memoria,
    nivel_abertura,
    analise_resumo
  } = req.body;

  if (!usuario_id || !texto || !Array.isArray(tags) || typeof intensidade !== "number") {
    return res.status(400).json({ erro: "Campos obrigatórios ausentes ou inválidos." });
  }

  try {
    const { data, error } = await supabase
      .from("memories")
      .insert([{
        usuario_id,
        mensagem_id: mensagem_id ?? null,
        resumo_eco: texto,
        tags: tags ?? [],
        intensidade,
        emocao_principal: emocao_principal ?? null,
        contexto: contexto ?? null,
        dominio_vida: dominio_vida ?? null,
        padrao_comportamental: padrao_comportamental ?? null,
        salvar_memoria: salvar_memoria !== false,
        nivel_abertura: typeof nivel_abertura === "number" ? nivel_abertura : null,
        analise_resumo: analise_resumo ?? null,
        data_registro: new Date().toISOString(),
      }])
      .select();

    if (error) {
      console.error("❌ Erro ao salvar memória:", error.message, error.details);
      return res.status(500).json({ erro: "Erro ao salvar memória no Supabase." });
    }

    console.log("✅ Memória salva:", data);
    return res.status(200).json({ sucesso: true, data });
  } catch (err: any) {
    console.error("❌ Erro inesperado ao salvar memória:", err.message || err);
    return res.status(500).json({ erro: "Erro inesperado no servidor." });
  }
});

// GET /api/memorias?usuario_id=...&limite=5 → Busca memórias de um usuário
router.get("/", async (req, res) => {
  const { usuario_id, limite } = req.query;

  if (!usuario_id || typeof usuario_id !== "string") {
    return res.status(400).json({ error: "usuario_id é obrigatório e deve ser uma string." });
  }

  try {
    const { data, error } = await supabase
      .from("memories")
      .select(`
        id,
        usuario_id,
        mensagem_id,
        resumo_eco,
        data_registro,
        emocao_principal,
        intensidade,
        contexto,
        categoria,
        salvar_memoria,
        dominio_vida,
        padrao_comportamental,
        nivel_abertura,
        analise_resumo,
        tags
      `)
      .eq("usuario_id", usuario_id)
      .eq("salvar_memoria", true) // ⚠️ adiciona filtro explícito
      .order("data_registro", { ascending: false })
      .limit(Number(limite) || 10);

    if (error) {
      console.error("❌ Erro ao buscar memórias:", error.message, error.details);
      return res.status(500).json({ error: "Erro ao buscar memórias no Supabase." });
    }

    console.log("📥 Memórias retornadas:", data);
    return res.status(200).json({ success: true, memories: data });
  } catch (err: any) {
    console.error("❌ Erro inesperado ao buscar memórias:", err.message || err);
    return res.status(500).json({
      error: "Erro inesperado no servidor.",
      details: err.message || err,
    });
  }
});

export default router;
