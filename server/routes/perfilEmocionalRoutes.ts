// routes/perfilEmocionalRoutes.ts
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { updateEmotionalProfile } from "../services/updateEmotionalProfile";

/**
 * Perfil emocional do usuário logado (id do token, nunca da query). Antes,
 * qualquer um lia o perfil de outra pessoa com ?usuario_id= e disparava o
 * LLM pago pelo POST /update aberto.
 */
const router = Router();
router.use(requireAuth);

const CAMPOS = "resumo_geral_ia, emocoes_frequentes, temas_recorrentes, ultima_interacao_sig, updated_at";

async function carregarPerfil(userId: string) {
  const { data, error } = await ensureSupabaseConfigured()
    .from("perfis_emocionais")
    .select(CAMPOS)
    .eq("usuario_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** GET /api/perfil-emocional: se ainda não existe e já há memórias, gera na hora. */
router.get("/", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    let perfil = await carregarPerfil(userId);
    if (!perfil) {
      const gerado = await updateEmotionalProfile(userId);
      if (gerado.success) perfil = await carregarPerfil(userId);
    }
    return res.status(200).json({ success: true, perfil });
  } catch (err: any) {
    console.error("[perfil-emocional] erro:", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao buscar perfil." });
  }
});

/** POST /api/perfil-emocional/update: recalcula (o texto da IA respeita o limite diário). */
router.post("/update", async (req: Request, res: Response) => {
  const resultado = await updateEmotionalProfile(req.user!.id);
  return res.status(resultado.success ? 200 : 422).json(resultado);
});

export default router;
