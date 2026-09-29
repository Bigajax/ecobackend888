import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { trackRelatorioEmocionalAcessado } from "../analytics/events/mixpanelEvents";
import { gerarRelatorioEmocional } from "../utils/relatorioEmocionalUtils";

/**
 * Relatório emocional do usuário logado (id do token, nunca da query).
 * GET /api/relatorio-emocional?dias=30
 */
const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    const dias = Number(req.query.dias ?? 30);
    const relatorio = await gerarRelatorioEmocional(userId, Number.isFinite(dias) ? dias : 30);
    trackRelatorioEmocionalAcessado({ userId, origem: "GET /api/relatorio-emocional" });
    return res.status(200).json({ success: true, relatorio });
  } catch (err: any) {
    console.error("[relatorio-emocional] erro:", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao gerar relatório emocional" });
  }
});

export default router;
