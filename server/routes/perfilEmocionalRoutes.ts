// routes/perfilEmocional.routes.ts
import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateEmotionalProfile } from "../services/updateEmotionalProfile";
import requireAdmin from "../mw/requireAdmin";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";

const router = Router();

router.use(requireAdmin);

/* --------------------------------- utils --------------------------------- */
function getUserIdFromReq(req: Request): string | null {
  const raw =
    (req.query?.usuario_id as string | string[] | undefined) ??
    (req.query?.userId as string | string[] | undefined);

  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1];
    return typeof last === "string" && last.trim() ? last.trim() : null;
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  return null;
}

function respondMissingUserId(res: Response) {
  return res.status(400).json({
    error: {
      code: "MISSING_USER_ID",
      message: "usuario_id é obrigatório",
    },
  });
}

async function carregarPerfil(client: SupabaseClient, userId: string) {
  const { data, error } = await client
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
      return respondMissingUserId(res);
    }

    const supabase = req.admin ?? ensureSupabaseConfigured();
    const data = await carregarPerfil(supabase, userId);

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
    const supabase = req.admin ?? ensureSupabaseConfigured();
    const data = await carregarPerfil(supabase, userId);

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
    const supabase = req.admin ?? ensureSupabaseConfigured();
    const resultado = await updateEmotionalProfile(userId, { supabase });
    return res.status(resultado.success ? 200 : 500).json(resultado);
  } catch (err: any) {
    console.error("[❌ perfil-emocional /update] ", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao atualizar perfil." });
  }
});

export default router;
