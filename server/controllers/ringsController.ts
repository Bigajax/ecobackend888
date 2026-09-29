/**
 * Cinco Anéis: /api/rings/* (requireAuth na rota; o id vem do token).
 */
import type { Request, Response } from "express";
import { ANEIS, RingsService, type Anel } from "../services/RingsService";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("rings-controller");
const service = () => new RingsService(ensureSupabaseConfigured());
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** POST /api/rings/dia  { date, ringId, answer, metadata } */
export async function salvarDia(req: Request, res: Response): Promise<void> {
  const { date, ringId, answer, metadata } = req.body ?? {};
  if (typeof date !== "string" || !DATA.test(date) || !ANEIS.includes(ringId) || typeof answer !== "string" || !answer.trim()) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "date (AAAA-MM-DD), ringId e answer são obrigatórios" });
    return;
  }
  try {
    const dia = await service().salvarDia(req.user!.id, {
      date,
      ringId: ringId as Anel,
      answer: answer.trim(),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    });
    res.status(200).json({ success: true, ritual: dia });
  } catch (error) {
    logger.error("salvar_dia_error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao salvar o dia" });
  }
}

/** GET /api/rings/history?limit=100 */
export async function historico(req: Request, res: Response): Promise<void> {
  try {
    const rituals = await service().historico(req.user!.id, Number(req.query.limit ?? 100) || 100);
    res.status(200).json({ rituals });
  } catch (error) {
    logger.error("historico_error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao buscar histórico" });
  }
}

/** POST /api/rings/migrate  { rituals: DailyRitual[] } */
export async function migrar(req: Request, res: Response): Promise<void> {
  const { rituals } = req.body ?? {};
  if (!Array.isArray(rituals)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Array de rituais é obrigatório" });
    return;
  }
  try {
    res.status(200).json(await service().migrar(req.user!.id, rituals.slice(0, 400)));
  } catch (error) {
    logger.error("migrar_error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao migrar rituais" });
  }
}
