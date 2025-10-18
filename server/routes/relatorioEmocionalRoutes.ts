import { Router, Request, Response } from "express";
import { trackRelatorioEmocionalAcessado } from "../analytics/events/mixpanelEvents";
import { gerarRelatorioEmocional } from "../utils/relatorioEmocionalUtils";
import { extractDistinctId, extractRelatorioView } from "./relatorioEmocionalView";

const router = Router();

/* -------------------------------- helpers ------------------------------- */
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

/* --------------------- GET /api/relatorio-emocional --------------------- */
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return respondMissingUserId(res);
    }

    const relatorio = await gerarRelatorioEmocional(userId);
    const view = extractRelatorioView(req);
    const originPath = req.originalUrl ? req.originalUrl.split("?")[0] : req.path;

    trackRelatorioEmocionalAcessado({
      distinctId: extractDistinctId(req),
      userId,
      origem: `GET ${originPath}`,
      view,
    });

    return res.status(200).json({
      success: true,
      relatorio,
      perfil: relatorio, // compat com frontend atual
      message: "Relatório carregado com sucesso.",
    });
  } catch (err: any) {
    console.error("[❌ relatorio-emocional /] ", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao gerar relatório emocional" });
  }
});

/* --------------- GET /api/relatorio-emocional/:usuario_id --------------- */
router.get("/:usuario_id", async (req: Request, res: Response) => {
  try {
    const { usuario_id } = req.params;
    if (!usuario_id || typeof usuario_id !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Parâmetro usuario_id ausente ou inválido." });
    }

    const relatorio = await gerarRelatorioEmocional(usuario_id);
    const view = extractRelatorioView(req);
    const originPath = req.originalUrl ? req.originalUrl.split("?")[0] : req.path;

    trackRelatorioEmocionalAcessado({
      distinctId: extractDistinctId(req),
      userId: usuario_id,
      origem: `GET ${originPath}`,
      view,
    });

    return res.status(200).json({
      success: true,
      relatorio,
      perfil: relatorio, // compat
      message: "Relatório carregado com sucesso.",
    });
  } catch (err: any) {
    console.error("[❌ relatorio-emocional /:usuario_id] ", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao gerar relatório emocional" });
  }
});

export default router;
