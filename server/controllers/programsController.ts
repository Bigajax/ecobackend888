import { Request, Response } from "express";
import { ProgramService } from "../services/ProgramService";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("programs-controller");

/**
 * Initialize program service
 */
function getProgramService(): ProgramService {
  const supabase = ensureSupabaseConfigured();
  return new ProgramService(supabase);
}

/**
 * POST /api/programs/start
 * Start a new program or resume existing enrollment
 */
export async function startProgram(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { programId, title, description, duration, deviceInfo } = req.body;

    // Validate required fields
    if (!programId || !title) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "programId e title são obrigatórios",
      });
      return;
    }

    const programService = getProgramService();

    // Check for existing active enrollment
    const existing = await programService.getActiveEnrollment(userId, programId);

    if (existing) {
      // Resume existing enrollment
      logger.info("resuming_enrollment", {
        userId,
        enrollmentId: existing.id,
        programId,
      });

      res.status(200).json({
        enrollmentId: existing.id,
        programId: existing.program_id,
        progress: existing.progress,
        currentStep: existing.current_step,
        currentLesson: existing.current_lesson,
        startedAt: existing.started_at,
        lastAccessedAt: existing.last_accessed_at,
        status: existing.status,
        resuming: true,
      });
      return;
    }

    // Create new enrollment
    const enrollment = await programService.createEnrollment({
      userId,
      programId,
      title,
      description,
      duration,
      deviceInfo,
    });

    logger.info("enrollment_created", {
      userId,
      enrollmentId: enrollment.id,
      programId,
    });

    res.status(201).json({
      enrollmentId: enrollment.id,
      programId: enrollment.program_id,
      progress: enrollment.progress,
      currentStep: enrollment.current_step,
      currentLesson: enrollment.current_lesson,
      startedAt: enrollment.started_at,
      status: enrollment.status,
    });
  } catch (error) {
    logger.error("start_program_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao iniciar programa",
    });
  }
}

/**
 * GET /api/programs/:enrollmentId
 * Get enrollment details with answers
 */
export async function getEnrollment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { enrollmentId } = req.params;

    const programService = getProgramService();
    const enrollment = await programService.getEnrollment(enrollmentId);

    if (!enrollment) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: "Enrollment não encontrado",
      });
      return;
    }

    // Verify ownership
    if (enrollment.user_id !== userId) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "Acesso negado",
      });
      return;
    }

    // Get answers
    const result = await programService.getEnrollmentWithAnswers(enrollmentId);

    if (!result) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: "Enrollment não encontrado",
      });
      return;
    }

    res.status(200).json({
      enrollmentId: result.enrollment.id,
      programId: result.enrollment.program_id,
      progress: result.enrollment.progress,
      currentStep: result.enrollment.current_step,
      currentLesson: result.enrollment.current_lesson,
      answers: result.answers,
      startedAt: result.enrollment.started_at,
      lastAccessedAt: result.enrollment.last_accessed_at,
      completedAt: result.enrollment.completed_at,
      status: result.enrollment.status,
    });
  } catch (error) {
    logger.error("get_enrollment_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao buscar enrollment",
    });
  }
}

/**
 * PUT /api/programs/:enrollmentId/progress
 * Update program progress
 */
export async function updateProgress(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { enrollmentId } = req.params;
    const { progress, currentStep, currentLesson } = req.body;

    // Validate
    if (
      typeof progress !== "number" ||
      typeof currentStep !== "number" ||
      !currentLesson
    ) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "progress, currentStep e currentLesson são obrigatórios",
      });
      return;
    }

    const programService = getProgramService();
    const enrollment = await programService.getEnrollment(enrollmentId);

    if (!enrollment) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: "Enrollment não encontrado",
      });
      return;
    }

    // Verify ownership
    if (enrollment.user_id !== userId) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "Acesso negado",
      });
      return;
    }

    // Update progress
    await programService.updateProgress(enrollmentId, {
      progress: Math.min(100, Math.max(0, progress)),
      currentStep,
      currentLesson,
    });

    logger.info("progress_updated", {
      userId,
      enrollmentId,
      progress,
      currentStep,
    });

    res.status(200).json({
      success: true,
      progress,
      currentStep,
      currentLesson,
      lastAccessedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("update_progress_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao atualizar progresso",
    });
  }
}

/**
 * POST /api/programs/:enrollmentId/answers
 * Save step answers (auto-save)
 */
export async function saveAnswers(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { enrollmentId } = req.params;
    const { stepNumber, answers } = req.body;

    // Validate
    if (!stepNumber || !answers) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "stepNumber e answers são obrigatórios",
      });
      return;
    }

    if (stepNumber < 1 || stepNumber > 6) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "stepNumber deve estar entre 1 e 6",
      });
      return;
    }

    const programService = getProgramService();
    const enrollment = await programService.getEnrollment(enrollmentId);

    if (!enrollment) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: "Enrollment não encontrado",
      });
      return;
    }

    // Verify ownership
    if (enrollment.user_id !== userId) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "Acesso negado",
      });
      return;
    }

    // Save answers
    await programService.saveStepAnswers(enrollmentId, stepNumber, answers);

    // Update last accessed
    await programService.updateLastAccess(enrollmentId);

    logger.info("answers_saved", {
      userId,
      enrollmentId,
      stepNumber,
    });

    res.status(200).json({
      success: true,
      saved: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("save_answers_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao salvar respostas",
    });
  }
}

/**
 * POST /api/programs/:enrollmentId/complete
 * Mark program as completed
 */
export async function completeProgram(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { enrollmentId } = req.params;

    const programService = getProgramService();
    const enrollment = await programService.getEnrollment(enrollmentId);

    if (!enrollment) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: "Enrollment não encontrado",
      });
      return;
    }

    // Verify ownership
    if (enrollment.user_id !== userId) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "Acesso negado",
      });
      return;
    }

    // Complete enrollment
    await programService.completeEnrollment(enrollmentId);

    // Calculate total time
    const startedAt = new Date(enrollment.started_at);
    const completedAt = new Date();
    const totalTimeMinutes = Math.round(
      (completedAt.getTime() - startedAt.getTime()) / (1000 * 60)
    );

    logger.info("program_completed", {
      userId,
      enrollmentId,
      programId: enrollment.program_id,
      totalTimeMinutes,
    });

    res.status(200).json({
      success: true,
      status: "completed",
      completedAt: completedAt.toISOString(),
      totalTimeMinutes,
    });
  } catch (error) {
    logger.error("complete_program_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao completar programa",
    });
  }
}

/**
 * POST /api/programs/:enrollmentId/abandon
 * Mark program as abandoned
 */
export async function abandonProgram(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { enrollmentId } = req.params;

    const programService = getProgramService();
    const enrollment = await programService.getEnrollment(enrollmentId);

    if (!enrollment) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: "Enrollment não encontrado",
      });
      return;
    }

    // Verify ownership
    if (enrollment.user_id !== userId) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "Acesso negado",
      });
      return;
    }

    // Abandon enrollment
    await programService.abandonEnrollment(enrollmentId);

    logger.info("program_abandoned", {
      userId,
      enrollmentId,
      programId: enrollment.program_id,
    });

    res.status(200).json({
      success: true,
      status: "abandoned",
    });
  } catch (error) {
    logger.error("abandon_program_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao abandonar programa",
    });
  }
}

/**
 * GET /api/programs/user/history
 * Get user's enrollment history
 */
export async function getUserHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const programService = getProgramService();
    const enrollments = await programService.getUserEnrollmentHistory(userId);

    const formattedEnrollments = enrollments.map((e) => ({
      enrollmentId: e.id,
      programId: e.program_id,
      status: e.status,
      progress: e.progress,
      currentStep: e.current_step,
      startedAt: e.started_at,
      completedAt: e.completed_at,
      lastAccessedAt: e.last_accessed_at,
    }));

    res.status(200).json({
      enrollments: formattedEnrollments,
    });
  } catch (error) {
    logger.error("get_user_history_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao buscar histórico",
    });
  }
}
