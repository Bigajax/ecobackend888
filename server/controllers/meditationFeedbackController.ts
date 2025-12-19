import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";
import {
  MeditationFeedbackPayloadSchema,
  type MeditationFeedbackPayload
} from "../schemas/meditationFeedback";
import type { ZodError } from "zod";

const logger = log.withContext("meditation-feedback-controller");

/**
 * Normalize text fields: trim and return null if empty
 */
function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Extract user identity from request headers and auth
 * Returns { user_id, session_id, guest_id }
 */
function extractIdentity(req: Request): {
  user_id: string | null;
  session_id: string | null;
  guest_id: string | null;
} {
  // user_id comes from JWT token (set by ensureIdentity middleware)
  const user_id = normalizeText((req as any).user?.id);

  // session_id and guest_id come from headers
  const session_id = normalizeText(req.get("X-Session-Id") ?? req.get("X-Eco-Session-Id"));
  const guest_id = normalizeText(req.get("X-Guest-Id") ?? req.get("X-Eco-Guest-Id"));

  return { user_id, session_id, guest_id };
}

/**
 * POST /api/meditation/feedback
 * Registers meditation session feedback with metrics
 */
export async function submitMeditationFeedback(req: Request, res: Response) {
  try {
    // 1. Extract identity
    const { user_id, session_id, guest_id } = extractIdentity(req);

    // 2. Validate session_id is present
    if (!session_id) {
      logger.warn("meditation_feedback.missing_session_id", {
        user_id,
        guest_id
      });
      return res.status(400).json({
        error: "Validation failed",
        details: ["X-Session-Id header is required"]
      });
    }

    // 3. Validate that either user_id or guest_id exists
    if (!user_id && !guest_id) {
      logger.warn("meditation_feedback.missing_identity", { session_id });
      return res.status(400).json({
        error: "Validation failed",
        details: ["Must be authenticated or provide X-Guest-Id header"]
      });
    }

    // 4. Validate and parse request body with Zod
    const parseResult = MeditationFeedbackPayloadSchema.safeParse(req.body);

    if (!parseResult.success) {
      const zodError = parseResult.error as ZodError;
      const errorDetails = zodError.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });

      logger.warn("meditation_feedback.validation_failed", {
        errors: errorDetails,
        user_id,
        guest_id,
        session_id
      });

      return res.status(400).json({
        error: "Validation failed",
        details: errorDetails
      });
    }

    const payload: MeditationFeedbackPayload = parseResult.data;

    // 5. Build database insert payload
    const dbPayload = {
      // Feedback principal
      vote: payload.vote,
      reasons: payload.vote === "negative" ? payload.reasons : null,

      // Contexto da meditação
      meditation_id: payload.meditation_id,
      meditation_title: payload.meditation_title,
      meditation_duration_seconds: payload.meditation_duration_seconds,
      meditation_category: payload.meditation_category,

      // Métricas de sessão
      actual_play_time_seconds: payload.actual_play_time_seconds,
      completion_percentage: payload.completion_percentage,
      pause_count: payload.pause_count ?? 0,
      skip_count: payload.skip_count ?? 0,
      seek_count: payload.seek_count ?? 0,

      // Som de fundo (opcional)
      background_sound_id: payload.background_sound_id ?? null,
      background_sound_title: payload.background_sound_title ?? null,

      // Identidade do usuário
      user_id: user_id,
      session_id: session_id,
      guest_id: guest_id,

      // Metadados
      feedback_source: payload.feedback_source ?? "meditation_completion"
    };

    // 6. Insert into database
    const analytics = getAnalyticsClient();
    const { data, error: insertError } = await analytics
      .from("meditation_feedback")
      .insert([dbPayload])
      .select("id")
      .single();

    if (insertError) {
      logger.error("meditation_feedback.insert_failed", {
        message: insertError.message,
        code: insertError.code ?? null,
        details: insertError.details ?? null,
        meditation_id: payload.meditation_id,
        user_id,
        guest_id,
        session_id
      });

      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to save meditation feedback"
      });
    }

    const feedbackId = data?.id;

    if (!feedbackId) {
      logger.error("meditation_feedback.no_id_returned", {
        meditation_id: payload.meditation_id,
        user_id,
        guest_id
      });

      return res.status(500).json({
        error: "Internal server error",
        message: "Feedback saved but no ID returned"
      });
    }

    // 7. Log success
    logger.info("meditation_feedback.saved", {
      feedback_id: feedbackId,
      meditation_id: payload.meditation_id,
      meditation_category: payload.meditation_category,
      vote: payload.vote,
      completion_percentage: payload.completion_percentage,
      user_id,
      guest_id,
      session_id
    });

    // 8. Return success response
    return res.status(201).json({
      success: true,
      feedback_id: feedbackId,
      message: "Feedback registrado com sucesso"
    });

  } catch (error) {
    // Catch unexpected errors
    logger.error("meditation_feedback.unexpected_error", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    });

    return res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred"
    });
  }
}
