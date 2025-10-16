import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("feedback-controller");

export async function registrarFeedback(req: Request, res: Response) {
  const { interaction_id, vote, reason, source, user_id, session_id, message_id, meta } = req.body ?? {};

  logger.info("feedback.request.start", {
    interaction_id: interaction_id ?? null,
    vote: vote ?? null,
    session_id: session_id ?? null,
    message_id: message_id ?? null,
    user_id: user_id ?? null,
    source: source ?? null,
  });

  if (!interaction_id || !vote) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const analytics = getAnalyticsClient();

  const { data: existingInteraction, error: checkErr } = await analytics
    .from("eco_interactions")
    .select("id")
    .eq("id", interaction_id)
    .limit(1)
    .maybeSingle();

  if (checkErr) {
    logger.error("feedback.interaction_check.error", {
      interaction_id,
      message: checkErr.message,
      code: checkErr.code ?? null,
      details: checkErr.details ?? null,
    });
    logger.info("feedback.interaction_check", { interaction_id, exists: false, error: true });
    return res.status(500).json({ error: "internal_error" });
  }

  logger.info("feedback.interaction_check", {
    interaction_id,
    exists: Boolean(existingInteraction),
  });

  if (!existingInteraction) {
    if (session_id || message_id) {
      const fallbackPayload: Record<string, unknown> = {
        id: interaction_id,
        session_id: session_id ?? null,
        message_id: message_id ?? null,
      };

      if (user_id) {
        fallbackPayload.user_id = user_id;
      }

      const { error: fallbackError } = await analytics
        .from("eco_interactions")
        .insert([fallbackPayload]);

      if (fallbackError) {
        if (fallbackError.code === "23505") {
          logger.info("feedback.fallback", {
            interaction_id,
            status: "conflict",
            session_id: session_id ?? null,
            message_id: message_id ?? null,
          });
        } else {
          logger.info("feedback.fallback", {
            interaction_id,
            status: "failed",
            code: fallbackError.code ?? null,
          });
          logger.error("feedback.fallback.error", {
            interaction_id,
            message: fallbackError.message,
            code: fallbackError.code ?? null,
            details: fallbackError.details ?? null,
          });
          return res.status(404).json({ error: "interaction_not_found" });
        }
      } else {
        logger.info("feedback.fallback", {
          interaction_id,
          status: "created",
          session_id: session_id ?? null,
          message_id: message_id ?? null,
        });
      }
    } else {
      return res.status(404).json({ error: "interaction_not_found" });
    }
  }

  const { error } = await analytics.from("eco_feedback").insert([
    {
      interaction_id,
      vote,
      reason,
      source,
      user_id: user_id ?? null,
      session_id: session_id ?? null,
      meta: meta ?? {},
    },
  ]);

  if (error) {
    if (error.code === "23505") {
      logger.info("feedback.insert.result", { interaction_id, status: "idempotent" });
      return res.status(204).end();
    }

    if (error.code === "23503") {
      logger.info("feedback.insert.result", { interaction_id, status: "fk_not_found" });
      return res.status(404).json({ error: "interaction_not_found" });
    }

    logger.error("feedback.insert.error", {
      interaction_id,
      message: error.message,
      code: error.code ?? null,
      details: error.details ?? null,
    });
    logger.info("feedback.insert.result", { interaction_id, status: "error" });
    return res.status(500).json({ error: "internal_error" });
  }

  logger.info("feedback.insert.result", { interaction_id, status: "created" });
  return res.status(204).end();
}
