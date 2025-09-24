// routes/perfilEmocional.routes.ts (ou caminho equivalente)
import { Router, type Request, type Response } from "express";
import getSupabaseAdmin from "../lib/supabaseAdmin";
import { updateEmotionalProfile } from "../services/updateEmotionalProfile";

const router = Router();

/* --------------------------------- utils --------------------------------- */
function getUserIdFromReq(req: Request): string | null {
  // 1) query string (?usuario_id=... | ?userId=...)
  const qs =
    (req.query?.usuario_id as string) ||
    (req.query?.userId as string) ||
    null;
  if (qs && typeof qs === "string" && qs.trim()) return qs.trim();

  // 2) Authorization: Bearer <jwt>  → decodifica payload e pega sub/user_id
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      const token = auth.slice(7);
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
        );
        return payload?.sub || payload?.user_id || payload?.uid || null;
      }
    } catch {
      // silencioso: não conseguimos extrair do JWT
    }
  }

  // 3) se tiver sido injetado por algum middleware
  const injected = (req as any).user?.id || null;
  return injected || null;
}

async function carregarPerfil(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("perfis_emocionais")
    .select(
      `
      id,
      usuario_id,
      resumo_geral_ia,
      emocoes_frequentes,
      temas_recorrentes,
      ultima_interacao_sig,
      updated_at
    `
    )
    .eq("usuario_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

/* --------------------------- GET /api/perfil-emocional --------------------------- */
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, error: "userId ausente. Envie ?usuario_id= ou Bearer JWT." });
    }

    const data = await carregarPerfil(userId);

    return res.status(200).json({
      success: true,
      perfil: data,
      message: data ? "Perfil carregado com sucesso." : "Perfil ainda não gerado.",
    });
  } catch (err: any) {
    console.error("[❌ perfil-emocional /] ", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao buscar perfil." });
  }
});

/* --------------------- GET /api/perfil-emocional/:userId --------------------- */
router.get("/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId || typeof userId !== "string") {
    return res
      .status(400)
      .json({ success: false, error: "Parâmetro userId ausente ou inválido." });
  }

  try {
    const data = await carregarPerfil(userId);

    return res.status(200).json({
      success: true,
      perfil: data,
      message: data ? "Perfil carregado com sucesso." : "Perfil ainda não gerado.",
    });
  } catch (err: any) {
    console.error("[❌ perfil-emocional /:userId] ", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao buscar perfil." });
  }
});

/* ----------------------- POST /api/perfil-emocional/update ---------------------- */
router.post("/update", async (req: Request, res: Response) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: "Campo userId é obrigatório." });
  }

  try {
    const resultado = await updateEmotionalProfile(userId);
    return res.status(resultado.success ? 200 : 500).json(resultado);
  } catch (err: any) {
    console.error("[❌ perfil-emocional /update] ", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao atualizar perfil." });
  }
});

export default router;
