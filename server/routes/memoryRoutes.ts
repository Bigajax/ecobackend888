import express from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { embedTextoCompleto } from "../services/embeddingService";
import { heuristicaNivelAbertura } from "../utils/heuristicaNivelAbertura";
import { gerarTagsAutomaticasViaIA } from "../services/tagService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias";

const router = express.Router();

/* ────────────────────────────────────────────────
   🔐 Helper – extrai usuário autenticado (Bearer)
────────────────────────────────────────────────── */
async function getUsuarioAutenticado(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    console.warn("[Auth] Falha ao obter usuário:", error?.message);
    return null;
  }
  return data.user;
}

/* ────────────────────────────────────────────────
   🧹 Utils
────────────────────────────────────────────────── */
const safeLog = (s: string) =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";

/* ────────────────────────────────────────────────
   ✅ Gera um resumoEco bem formatado
────────────────────────────────────────────────── */
function gerarResumoEco(
  texto: string,
  tags: string[] = [],
  intensidade: number,
  emocao_principal?: string | null,
  analise_resumo?: string | null
) {
  const linhas: string[] = [`🗣️ "${(texto || "").trim()}"`];
  if (tags?.length) linhas.push(`🏷️ Tags: ${tags.join(", ")}`);
  if (emocao_principal) linhas.push(`❤️ Emoção: ${emocao_principal}`);
  linhas.push(`🔥 Intensidade: ${intensidade}`);
  if (analise_resumo && analise_resumo.trim()) {
    linhas.push(`\n🧭 Resumo Analítico:\n${analise_resumo.trim()}`);
  } else {
    linhas.push(`⚠️ Sem análise detalhada disponível.`);
  }
  return linhas.join("\n");
}

/* ────────────────────────────────────────────────
   ✅ POST /api/memorias/registrar → salva memória
────────────────────────────────────────────────── */
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
    salvar_memoria = true,
    nivel_abertura,
    analise_resumo,
    categoria = "emocional",
  } = req.body;

  if (!texto || typeof intensidade !== "number" || (!Array.isArray(tags) && typeof tags !== "object")) {
    return res.status(400).json({ erro: "Campos obrigatórios ausentes ou inválidos." });
  }

  try {
    const destinoTabela = intensidade >= 7 ? "memories" : "referencias_temporarias";

    let finalTags: string[] = Array.isArray(tags) ? tags : [];
    if (finalTags.length === 0) {
      finalTags = await gerarTagsAutomaticasViaIA(texto);
    }

    // Embeddings (parse defensivo)
    const rawSem = await embedTextoCompleto(texto);
    const embedding_semantico: number[] = Array.isArray(rawSem) ? rawSem : JSON.parse(String(rawSem));
    if (!Array.isArray(embedding_semantico)) {
      return res.status(500).json({ erro: "Falha ao gerar embedding semântico." });
    }

    const rawEmo = await embedTextoCompleto(analise_resumo ?? texto);
    const embedding_emocional: number[] = Array.isArray(rawEmo) ? rawEmo : JSON.parse(String(rawEmo));
    if (!Array.isArray(embedding_emocional)) {
      return res.status(500).json({ erro: "Falha ao gerar embedding emocional." });
    }

    const nivelCalc =
      typeof nivel_abertura === "number" ? nivel_abertura : heuristicaNivelAbertura(texto);

    const { data, error } = await supabaseAdmin
      .from(destinoTabela)
      .insert([{
        usuario_id: user.id,
        mensagem_id: mensagem_id ?? null,
        resumo_eco: gerarResumoEco(texto, finalTags, intensidade, emocao_principal, analise_resumo),
        tags: finalTags,
        intensidade,
        emocao_principal: emocao_principal ?? null,
        contexto: contexto ?? null,
        dominio_vida: dominio_vida ?? null,
        padrao_comportamental: padrao_comportamental ?? null,
        salvar_memoria,
        nivel_abertura: nivelCalc,
        analise_resumo: analise_resumo ?? null,
        categoria,
        created_at: new Date().toISOString(),
        embedding_semantico,
        embedding_emocional,
      }])
      .select();

    if (error) {
      console.error("❌ Erro ao salvar:", error.message, error.details);
      return res.status(500).json({ erro: "Erro ao salvar no Supabase." });
    }

    console.log(`✅ Registro salvo em [${destinoTabela}]:`, data);
    return res.status(201).json({ sucesso: true, tabela: destinoTabela, data });
  } catch (err: any) {
    console.error("❌ Erro inesperado ao salvar:", err.message || err);
    return res.status(500).json({ erro: "Erro inesperado no servidor." });
  }
});

/* ────────────────────────────────────────────────
   ✅ GET /api/memorias → lista memórias salvas
────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

  const { limite } = req.query;

  try {
    let query = supabaseAdmin
      .from("memories")
      .select("*")
      .eq("usuario_id", user.id)
      .eq("salvar_memoria", true)
      .order("created_at", { ascending: false });

    if (limite) {
      const lim = Number(limite);
      if (!isNaN(lim) && lim > 0) query = query.range(0, lim - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error("❌ Erro ao buscar memórias:", error.message, error.details);
      return res.status(500).json({ error: "Erro ao buscar memórias no Supabase." });
    }

    const memoriesFiltradas = (data || []).filter(
      (m) => typeof m.resumo_eco === "string" && m.resumo_eco.trim() !== "" && m.created_at,
    );

    console.log(`📥 ${memoriesFiltradas.length} memórias retornadas para ${user.id}`);
    return res.status(200).json({ success: true, memories: memoriesFiltradas });
  } catch (err: any) {
    console.error("❌ Erro inesperado ao buscar memórias:", err.message || err);
    return res.status(500).json({ error: "Erro inesperado no servidor." });
  }
});

/* ────────────────────────────────────────────────
   ✅ POST /api/memorias/similares → delega ao service
────────────────────────────────────────────────── */
router.post("/similares", async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ erro: "Usuário não autenticado." });

  const texto: string = String(req.body?.texto ?? "");
  const limite: number = Math.max(1, Math.min(5, Number(req.body?.limite ?? 3)));
  let threshold: number = Math.max(0, Math.min(1, Number(req.body?.threshold ?? 0.15)));

  // threshold adaptativo (opcional)
  if (/lembr|record|memó/i.test(texto)) threshold = Math.min(threshold, 0.12);
  if (texto.trim().length < 20) threshold = Math.min(threshold, 0.10);

  console.log("📩 /similares:", { texto: safeLog(texto), limite, threshold });

  if (!texto) {
    return res.status(400).json({ erro: "Texto para análise é obrigatório." });
  }
  if (texto.trim().length < 3) {
    return res.status(200).json({ sucesso: true, similares: [] });
  }

  try {
    const similares = await buscarMemoriasSemelhantes(user.id, {
      texto,
      k: limite,
      threshold,
    });

    console.log(`🔍 ${similares.length} memórias semelhantes normalizadas.`);
    return res.status(200).json({ sucesso: true, similares });
  } catch (err: any) {
    console.error("❌ Erro em /similares:", err.message || err);
    return res.status(500).json({ erro: "Erro inesperado no servidor." });
  }
});

export default router;
