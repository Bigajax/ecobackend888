import express from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const router = express.Router();

// 🔐 Utilitário para extrair usuário autenticado do token Bearer
async function getUsuarioAutenticado(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    console.warn("[🔐 Auth] Falha ao obter usuário:", error?.message);
    return null;
  }

  return data.user;
}

// 📌 POST /api/memorias/registrar → Salva nova memória
router.post("/registrar", async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ erro: "Usuário não autenticado." });

  const {
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
    analise_resumo,
    categoria
  } = req.body;

  if (!texto || typeof intensidade !== "number" || (!Array.isArray(tags) && typeof tags !== "object")) {
    return res.status(400).json({ erro: "Campos obrigatórios ausentes ou inválidos." });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("memories")
      .insert([
        {
          usuario_id: user.id,
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
          categoria: categoria ?? "emocional",
          data_registro: new Date().toISOString()
        }
      ])
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

// 📌 GET /api/memorias → Busca memórias do usuário autenticado
router.get("/", async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

  const { limite } = req.query;

  try {
    const { data, error } = await supabaseAdmin
      .from("memories")
      .select("*")
      .eq("usuario_id", user.id)
      .eq("salvar_memoria", true)
      .order("data_registro", { ascending: false })
      .limit(Number(limite) || 50);

    if (error) {
      console.error("❌ Erro ao buscar memórias:", error.message, error.details);
      return res.status(500).json({ error: "Erro ao buscar memórias no Supabase." });
    }

    console.log(`📥 ${data.length} memórias retornadas para ${user.id}`);
    return res.status(200).json({ success: true, memories: data });
  } catch (err: any) {
    console.error("❌ Erro inesperado ao buscar memórias:", err.message || err);
    return res.status(500).json({ error: "Erro inesperado no servidor." });
  }
});

export default router;