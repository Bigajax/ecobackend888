// src/routes/memorias.routes.ts
import express from "express";
import supabaseAdmin from "../lib/supabaseAdmin";
import { embedTextoCompleto } from "../services/embeddingService";
import { heuristicaNivelAbertura } from "../utils/heuristicaNivelAbertura";
import { gerarTagsAutomaticasViaIA } from "../services/tagService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias";

const router = express.Router();

/* ────────────────────────────────────────────────
   🔐 Auth helper – extrai usuário autenticado (Bearer)
────────────────────────────────────────────────── */
async function getUsuarioAutenticado(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    console.warn("[Auth] Falha ao obter usuário:", error?.message);
    return null;
  }
  return data.user;
}

/* ──────────────────────────────────────────────── */
const safeLog = (s: string) =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 80) + "…" : s || "";

/* ────────────────────────────────────────────────
   🧩 Util: coagir boolean (aceita 'true'/'false')
────────────────────────────────────────────────── */
function toBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
}

/* ────────────────────────────────────────────────
   🧠 formata resumoEco
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
  if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

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
  } = req.body ?? {};

  if (!texto || typeof intensidade !== "number") {
    return res.status(400).json({ error: "Campos obrigatórios ausentes ou inválidos." });
  }

  try {
    const salvar = toBool(salvar_memoria, true);
    const destinoTabela = intensidade >= 7 && salvar ? "memories" : "referencias_temporarias";

    let finalTags: string[] = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    if (finalTags.length === 0) {
      finalTags = await gerarTagsAutomaticasViaIA(texto);
    }

    // Embeddings defensivos
    const rawSem = await embedTextoCompleto(texto);
    const embedding_semantico: number[] = Array.isArray(rawSem) ? rawSem : JSON.parse(String(rawSem));
    if (!Array.isArray(embedding_semantico)) {
      return res.status(500).json({ error: "Falha ao gerar embedding semântico." });
    }

    const rawEmo = await embedTextoCompleto(analise_resumo ?? texto);
    const embedding_emocional: number[] = Array.isArray(rawEmo) ? rawEmo : JSON.parse(String(rawEmo));
    if (!Array.isArray(embedding_emocional)) {
      return res.status(500).json({ error: "Falha ao gerar embedding emocional." });
    }

    const nivelCalc =
      typeof nivel_abertura === "number" ? nivel_abertura : heuristicaNivelAbertura(texto);

    const { data, error } = await supabaseAdmin
      .from(destinoTabela)
      .insert([
        {
          usuario_id: user.id,
          mensagem_id: mensagem_id ?? null,
          resumo_eco: gerarResumoEco(texto, finalTags, intensidade, emocao_principal, analise_resumo),
          tags: finalTags,
          intensidade,
          emocao_principal: emocao_principal ?? null,
          contexto: contexto ?? null,
          dominio_vida: dominio_vida ?? null,
          padrao_comportamental: padrao_comportamental ?? null,
          salvar_memoria: salvar, // sempre boolean
          nivel_abertura: nivelCalc,
          analise_resumo: analise_resumo ?? null,
          categoria,
          created_at: new Date().toISOString(),
          embedding_semantico,
          embedding_emocional,
        },
      ])
      .select();

    if (error) {
      console.error("❌ Erro ao salvar:", error.message, error.details);
      return res.status(500).json({ error: "Erro ao salvar no Supabase." });
    }

    console.log(`✅ Registro salvo em [${destinoTabela}]:`, data);
    return res.status(201).json({ success: true, table: destinoTabela, data });
  } catch (err: any) {
    console.error("❌ Erro inesperado ao salvar:", err.message || err);
    return res.status(500).json({ error: "Erro inesperado no servidor." });
  }
});

/* ────────────────────────────────────────────────
   ✅ GET /api/memorias → lista memórias (com filtro opcional por tags)
   Params:
     - tags=tag1&tags=tag2  (ou tags="tag1,tag2")
     - limite=5  (ou limit=5)
────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

  // aceita limite ou limit
  const limiteParam = (req.query.limite ?? req.query.limit) as string | undefined;
  const lim = Math.max(0, Number(limiteParam ?? 0)) || undefined;

  // aceita tags como múltiplos params ou string única separada por vírgula
  let tags: string[] = [];
  const qTags = req.query.tags;
  if (Array.isArray(qTags)) {
    tags = qTags
      .flatMap((t) => String(t).split(","))
      .map((t) => t.trim())
      .filter(Boolean);
  } else if (typeof qTags === "string") {
    tags = qTags.split(",").map((t) => t.trim()).filter(Boolean);
  }

  try {
    let query = supabaseAdmin
      .from("memories")
      .select("*")
      .eq("usuario_id", user.id)
      .eq("salvar_memoria", true)
      .order("created_at", { ascending: false });

    if (tags.length) {
      // Para array/text[]: usa overlaps (qualquer interseção)
      query = query.overlaps("tags", tags);
    }

    if (lim && lim > 0) query = query.range(0, lim - 1);

    const { data, error } = await query;

    if (error) {
      console.error("❌ Erro ao buscar memórias:", error.message, error.details);
      return res.status(500).json({ error: "Erro ao buscar memórias no Supabase." });
    }

    const memoriesFiltradas = (data || []).filter(
      (m) => typeof m.resumo_eco === "string" && m.resumo_eco.trim() !== "" && m.created_at
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
   Body:
     - texto (ou query) : string
     - limite (ou limit): number (1..5)
     - threshold? : 0..1
────────────────────────────────────────────────── */
router.post("/similares", async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

  const textoRaw: string = String(req.body?.texto ?? req.body?.query ?? "");
  const texto = textoRaw.trim();
  const limiteRaw = Number(req.body?.limite ?? req.body?.limit ?? 3);
  const limite = Math.max(1, Math.min(5, isNaN(limiteRaw) ? 3 : limiteRaw));
  let threshold: number = Math.max(0, Math.min(1, Number(req.body?.threshold ?? 0.15)));

  // threshold adaptativo simples
  if (/lembr|record|memó/i.test(texto)) threshold = Math.min(threshold, 0.12);
  if (texto.length < 20) threshold = Math.min(threshold, 0.1);

  console.log("📩 /similares:", { texto: safeLog(texto), limite, threshold });

  if (!texto) {
    return res.status(400).json({ error: "Texto para análise é obrigatório." });
  }
  if (texto.length < 3) {
    return res.status(200).json({ success: true, similares: [] });
  }

  try {
    const similares = await buscarMemoriasSemelhantes(user.id, {
      texto,
      k: limite,
      threshold,
    });

    console.log(`🔍 ${similares.length} memórias semelhantes normalizadas.`);
    return res.status(200).json({ success: true, similares });
  } catch (err: any) {
    console.error("❌ Erro em /similares:", err.message || err);
    return res.status(500).json({ error: "Erro inesperado no servidor." });
  }
});

export default router;
