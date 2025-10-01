import { Router, Request, Response } from "express";
import { trackRelatorioEmocionalAcessado } from "../analytics/events/mixpanelEvents";
import { gerarRelatorioEmocional } from "../utils/relatorioEmocionalUtils";
import { extractDistinctId, extractRelatorioView } from "./relatorioEmocionalView";

const router = Router();

/* -------------------------------- helpers ------------------------------- */
function getUserIdFromReq(req: Request): string | null {
  // 1) query string
  const q =
    (req.query?.usuario_id as string) ||
    (req.query?.userId as string) ||
    null;
  if (q && typeof q === "string" && q.trim()) return q.trim();

  // 2) Authorization: Bearer <jwt> → decodifica payload e pega sub/user_id
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
      // silencioso
    }
  }

  return null;
}

/* --------------------- GET /api/relatorio-emocional --------------------- */
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, error: "userId ausente. Envie ?usuario_id= ou use Bearer JWT." });
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
