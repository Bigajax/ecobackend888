// src/routes/memorias.routes.ts
import express, { type Request, type Response } from "express";
import { supabase } from "../lib/supabaseAdmin"; // ✅ instância única
import { embedTextoCompleto, unitNorm } from "../services/embeddingService";
import { heuristicaNivelAbertura } from "../utils/heuristicaNivelAbertura";
import { gerarTagsAutomaticasViaIA } from "../services/tagService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias";

const router = express.Router();

/* ────────────────────────────────────────────────
   🔐 Auth helper – extrai usuário autenticado (Bearer)
────────────────────────────────────────────────── */
async function getUsuarioAutenticado(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      console.warn("[Auth] Falha ao obter usuário:", error?.message);
      return null;
    }
    return data.user;
  } catch (e: any) {
    console.error("[Auth] Erro no getUser(jwt):", e?.message ?? e);
    return null;
  }
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

/* --------------------------------- helpers -------------------------------- */
function toNumArray(v: unknown): number[] | null {
  try {
    const arr = Array.isArray(v) ? v : JSON.parse(String(v));
    if (!Array.isArray(arr)) return null;
    const nums = (arr as unknown[]).map((x) => Number(x));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums;
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────
   ✅ POST /api/memorias/registrar → salva memória
────────────────────────────────────────────────── */
router.post("/registrar", async (req: Request, res: Response) => {
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
    // 🔒 clamp 0..10 para não violar o CHECK do banco
    const intensidadeClamped = Math.max(0, Math.min(10, Number(intensidade) ?? 0));

    const salvar = toBool(salvar_memoria, true);
    const destinoTabela = intensidadeClamped >= 7 && salvar ? "memories" : "referencias_temporarias";

    // Normaliza tags (string ou array)
    let finalTags: string[] =
      Array.isArray(tags)
        ? tags
        : typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

    if (finalTags.length === 0) {
      finalTags = await gerarTagsAutomaticasViaIA(texto);
    }

    // Embedding principal (salvo em 'embedding')
    const rawSem = await embedTextoCompleto(texto);
    const semArr = toNumArray(rawSem);
    if (!semArr) return res.status(500).json({ error: "Falha ao gerar embedding." });
    const embedding = unitNorm(semArr);

    // Opcional: embedding emocional (mantido se você usa)
    const rawEmo = await embedTextoCompleto(analise_resumo ?? texto);
    const emoArr = toNumArray(rawEmo);
    if (!emoArr) return res.status(500).json({ error: "Falha ao gerar embedding emocional." });
    const embedding_emocional = unitNorm(emoArr);

    const nivelCalc =
      typeof nivel_abertura === "number" ? nivel_abertura : heuristicaNivelAbertura(texto);

    const { data, error } = await supabase
      .from(destinoTabela)
      .insert([
        {
          usuario_id: user.id,
          mensagem_id: mensagem_id ?? null,
          resumo_eco: gerarResumoEco(
            texto,
            finalTags,
            intensidadeClamped,
            emocao_principal,
            analise_resumo
          ),
          tags: finalTags,
          intensidade: intensidadeClamped,
          emocao_principal: emocao_principal ?? null,
          contexto: contexto ?? null,
          dominio_vida: dominio_vida ?? null,
          padrao_comportamental: padrao_comportamental ?? null,
          salvar_memoria: Boolean(salvar),
          nivel_abertura: nivelCalc,
          analise_resumo: analise_resumo ?? null,
          categoria,
          // ⚠️ não setamos created_at manualmente; usa DEFAULT do banco
          embedding,               // ✅ coluna principal usada nas buscas
          embedding_emocional,     // ✅ mantido (opcional) para futuras buscas emocionais
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
────────────────────────────────────────────────── */
router.get("/", async (req: Request, res: Response) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

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
    let query = supabase
      .from("memories")
      .select("*")
      .eq("usuario_id", user.id)
      .eq("salvar_memoria", true)
      .order("created_at", { ascending: false });

    if (tags.length) {
      // Para text[]/_text: retorna linhas onde há interseção com qualquer uma das tags
      query = query.overlaps("tags", tags);
    }

    if (lim && lim > 0) query = query.range(0, lim - 1);

    const { data, error } = await query;

    if (error) {
      console.error("❌ Erro ao buscar memórias:", error.message, error.details);
      return res.status(500).json({ error: "Erro ao buscar memórias no Supabase." });
    }

    const memoriesFiltradas = (data || []).filter(
      (m: any) => typeof m.resumo_eco === "string" && m.resumo_eco.trim() !== "" && m.created_at
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
router.post("/similares", async (req: Request, res: Response) => {
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
