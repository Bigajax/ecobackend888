import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("feedback-controller");

type FeedbackVote = "up" | "down";

type FeedbackPayload = {
  interaction_id?: string | null;
  response_id?: string | null;
  vote?: FeedbackVote;
  reason?: string | null;
  pillar?: string | null;
  arm?: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function registrarFeedback(req: Request, res: Response) {
  const body = (req.body ?? {}) as FeedbackPayload;
  const vote = body.vote === "up" || body.vote === "down" ? body.vote : null;

  if (!vote) {
    logger.warn("feedback.invalid_payload", { reason: "missing_vote" });
    return res.status(400).json({ error: "missing vote" });
  }

  const interactionId = normalizeText(body.interaction_id);
  const responseId = normalizeText(body.response_id) ?? interactionId;

  if (!responseId) {
    logger.warn("feedback.invalid_payload", { reason: "missing_response_id" });
    return res.status(400).json({ error: "missing response_id/interaction_id" });
  }

  const analytics = getAnalyticsClient();
  const reward = vote === "up" ? 1 : 0;

  let armKey = normalizeText(body.arm);
  const pillar = normalizeText(body.pillar) ?? "default";

  if (!armKey && interactionId) {
    const { data: inferredModule, error: moduleError } = await analytics
      .from("eco_module_usages")
      .select("module_key")
      .eq("interaction_id", interactionId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (moduleError) {
      if (moduleError.code !== "PGRST116") {
        logger.warn("feedback.arm_inference_failed", {
          interaction_id: interactionId,
          message: moduleError.message,
          code: moduleError.code ?? null,
          details: moduleError.details ?? null,
        });
      }
    } else if (inferredModule?.module_key && typeof inferredModule.module_key === "string") {
      armKey = normalizeText(inferredModule.module_key) ?? armKey;
    }
  }

  if (!armKey) {
    armKey = "baseline";
  }

  if (interactionId) {
    const feedbackMeta: Record<string, unknown> = { pillar, arm: armKey };
    const reason = normalizeText(body.reason);

    const { error: feedbackError } = await analytics.from("eco_feedback").insert([
      {
        interaction_id: interactionId,
        vote,
        reason: reason ? [reason] : null,
        source: "api", // mantém origem previsível para analytics
        user_id: null,
        session_id: null,
        meta: feedbackMeta,
      },
    ]);

    if (feedbackError) {
      const code = feedbackError.code ?? null;

      if (code === "42P01") {
        logger.warn("feedback.table_missing", { table: "eco_feedback" });
      } else if (code !== "23505") {
        logger.warn("feedback.persist_failed", {
          interaction_id: interactionId,
          message: feedbackError.message,
          code,
          details: feedbackError.details ?? null,
        });
      }
    }
  }

  const rewardPayload = {
    response_id: responseId,
    pilar: pillar,
    arm: armKey,
    recompensa: reward,
  };

  const { error: rewardError } = await analytics
    .from("bandit_rewards")
    .upsert([rewardPayload], { onConflict: "response_id,arm" });

  if (rewardError) {
    if (rewardError.code === "42P01") {
      logger.warn("feedback.bandit_table_missing", {});
    } else {
      logger.warn("feedback.bandit_reward_failed", {
        response_id: responseId,
        arm: armKey,
        message: rewardError.message,
        code: rewardError.code ?? null,
        details: rewardError.details ?? null,
      });
    }
  }

  const { error: rpcError } = await analytics.rpc("update_bandit_arm", {
    p_arm_key: armKey,
    p_reward: reward,
  });

  if (rpcError) {
    logger.warn("feedback.bandit_arm_update_failed", {
      arm: armKey,
      message: rpcError.message,
      code: rpcError.code ?? null,
      details: rpcError.details ?? null,
    });
  }

  logger.info("feedback_reward_applied", {
    vote,
    arm: armKey,
    pillar,
    response_id: responseId,
    interaction_id: interactionId,
    reward,
  });

  return res.status(204).end();
}
