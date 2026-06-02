/**
 * RingsController - HTTP request handlers for Five Rings API
 * Routes: /api/rings/*
 */

import { Request, Response } from "express";
import { RingsService } from "../services/RingsService";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("rings-controller");

/**
 * Initialize rings service
 */
function getRingsService(): RingsService {
  const supabase = ensureSupabaseConfigured();
  return new RingsService(supabase);
}

/**
 * POST /api/rings/start
 * Start a new daily ritual or resume existing one
 */
export async function startRitual(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { date, notes } = req.body;
    const ritualDate = date || new Date().toISOString().split("T")[0];

    const ringsService = getRingsService();

    // Check for existing ritual for this date
    const existing = await ringsService.getRitualByDate(userId, ritualDate);

    if (existing) {
      // Resume existing ritual
      logger.info("resuming_ritual", {
        userId,
        ritualId: existing.id,
        date: ritualDate,
      });

      res.status(200).json({
        ritualId: existing.id,
        userId: existing.user_id,
        date: existing.date,
        status: existing.status,
        answers: existing.ring_answers || [],
        startedAt: existing.started_at,
        completedAt: existing.completed_at,
        resuming: true,
      });
      return;
    }

    // Create new ritual
    const ritual = await ringsService.createRitual({
      userId,
      date: ritualDate,
      notes,
    });

    logger.info("ritual_created", {
      userId,
      ritualId: ritual.id,
      date: ritualDate,
    });

    res.status(201).json({
      ritualId: ritual.id,
      userId: ritual.user_id,
      date: ritual.date,
      status: ritual.status,
      answers: [],
      startedAt: ritual.started_at,
      resuming: false,
    });
  } catch (error) {
    logger.error("start_ritual_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao iniciar ritual",
    });
  }
}

/**
 * POST /api/rings/:ritualId/answer
 * Save or update a ring answer
 */
export async function saveRingAnswer(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { ritualId } = req.params;
    const { ringId, answer, metadata } = req.body;

    // Validate required fields
    if (!ringId || !answer) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "ringId e answer são obrigatórios",
      });
      return;
    }

    // Validate ringId
    const validRingIds = ["earth", "water", "fire", "wind", "void"];
    if (!validRingIds.includes(ringId)) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `ringId inválido. Deve ser um de: ${validRingIds.join(", ")}`,
      });
      return;
    }

    const ringsService = getRingsService();

    // Save answer (RLS will verify ownership)
    const savedAnswer = await ringsService.saveRingAnswer({
      ritualId,
      ringId,
      answer,
      metadata: metadata || {},
    });

    // Count answered rings
    const answeredCount = await ringsService.countAnsweredRings(ritualId);

    logger.info("ring_answer_saved", {
      userId,
      ritualId,
      ringId,
      answeredCount,
    });

    res.status(200).json({
      success: true,
      answerId: savedAnswer.id,
      saved: true,
      ritualId,
      answeredRings: answeredCount,
      totalRings: 5,
    });
  } catch (error) {
    logger.error("save_ring_answer_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Handle specific errors
    if (error instanceof Error && error.message.includes("não encontrado")) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao salvar resposta",
    });
  }
}

/**
 * POST /api/rings/:ritualId/complete
 * Mark ritual as completed
 */
export async function completeRitual(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { ritualId } = req.params;
    const { notes } = req.body;

    const ringsService = getRingsService();

    // Complete ritual (will check if 5 rings are answered)
    const completedRitual = await ringsService.completeRitual(
      ritualId,
      userId,
      notes
    );

    // Calculate streak
    const streak = await ringsService.calculateStreak(userId);

    logger.info("ritual_completed", {
      userId,
      ritualId,
      currentStreak: streak.current,
      longestStreak: streak.longest,
    });

    res.status(200).json({
      success: true,
      ritualId: completedRitual.id,
      completedAt: completedRitual.completed_at,
      answeredRings: 5,
      streak: {
        current: streak.current,
        longest: streak.longest,
      },
    });
  } catch (error) {
    logger.error("complete_ritual_error", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Handle validation errors (not all rings answered)
    if (
      error instanceof Error &&
      error.message.includes("5 anéis")
    ) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao completar ritual",
    });
  }
}

/**
 * GET /api/rings/history
 * Get ritual history with filters and pagination
 */
export async function getRitualHistory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      startDate,
      endDate,
      limit = "30",
      offset = "0",
      status,
      includeAnswers = "true",
    } = req.query;

    const ringsService = getRingsService();

    const result = await ringsService.getRitualHistory({
      userId,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      status: status as string | undefined,
      includeAnswers: includeAnswers === "true",
    });

    logger.info("ritual_history_fetched", {
      userId,
      count: result.rituals.length,
      total: result.pagination.total,
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error("get_ritual_history_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao buscar histórico",
    });
  }
}

/**
 * GET /api/rings/ritual/:ritualId
 * Get ritual details with all answers
 */
export async function getRitualDetails(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { ritualId } = req.params;

    const ringsService = getRingsService();
    const ritual = await ringsService.getRitualDetails(ritualId, userId);

    if (!ritual) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: "Ritual não encontrado",
      });
      return;
    }

    logger.info("ritual_details_fetched", { userId, ritualId });

    res.status(200).json({
      ritualId: ritual.id,
      userId: ritual.user_id,
      date: ritual.date,
      status: ritual.status,
      notes: ritual.notes,
      completedAt: ritual.completed_at,
      startedAt: ritual.started_at,
      answers: ritual.ring_answers || [],
    });
  } catch (error) {
    logger.error("get_ritual_details_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao buscar detalhes do ritual",
    });
  }
}

/**
 * GET /api/rings/progress
 * Get user progress and statistics
 */
export async function getProgress(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ringsService = getRingsService();
    const progress = await ringsService.getUserProgress(userId);

    logger.info("user_progress_fetched", {
      userId,
      totalDays: progress.totalDaysCompleted,
      currentStreak: progress.currentStreak,
    });

    res.status(200).json(progress);
  } catch (error) {
    logger.error("get_progress_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao buscar progresso",
    });
  }
}

/**
 * POST /api/rings/:ritualId/abandon
 * Mark ritual as abandoned
 */
export async function abandonRitual(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { ritualId } = req.params;

    const ringsService = getRingsService();
    await ringsService.abandonRitual(ritualId, userId);

    logger.info("ritual_abandoned", { userId, ritualId });

    res.status(200).json({
      success: true,
      ritualId,
    });
  } catch (error) {
    logger.error("abandon_ritual_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao abandonar ritual",
    });
  }
}

/**
 * POST /api/rings/migrate
 * Migrate rituals from localStorage to backend
 */
export async function migrateFromLocalStorage(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { rituals } = req.body;

    if (!rituals || !Array.isArray(rituals)) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Array de rituais é obrigatório",
      });
      return;
    }

    const ringsService = getRingsService();
    const result = await ringsService.migrateRituals(userId, rituals);

    logger.info("rituals_migrated", {
      userId,
      migratedCount: result.migratedCount,
      totalRituals: result.totalRituals,
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error("migrate_from_localstorage_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao migrar rituais",
    });
  }
}
