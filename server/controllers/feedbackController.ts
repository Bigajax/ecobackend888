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
  message_id?: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const voteMap: Record<string, FeedbackVote> = {
  up: "up",
  down: "down",
  like: "up",
  dislike: "down",
};

export async function registrarFeedback(req: Request, res: Response) {
  const body = (req.body ?? {}) as FeedbackPayload;
  const voteInput = typeof body.vote === "string" ? body.vote.trim().toLowerCase() : "";
  const vote = voteMap[voteInput] ?? null;

  if (!vote) {
    logger.warn("feedback.invalid_payload", { reason: "missing_vote" });
    return res.status(400).json({ message: "missing vote", status: 400 });
  }

  const interactionId = normalizeText(body.interaction_id);

  if (!interactionId) {
    logger.warn("feedback_missing_interaction", { reason: "missing_interaction_id" });
    return res.status(400).json({ message: "missing_interaction_id", status: 400 });
  }

  const analytics = getAnalyticsClient();
  const guestIdHeader = normalizeText(req.get("X-Eco-Guest-Id") ?? null);
  const reward = vote === "up" ? 1 : -1;

  const {
    data: interaction,
    error: interactionError,
  } = await analytics
    .from("eco_interactions")
    .select("id, message_id, prompt_hash, user_id, session_id")
    .eq("id", interactionId)
    .maybeSingle();

  if (interactionError) {
    logger.error("feedback.interaction_lookup_failed", {
      interaction_id: interactionId,
      message: interactionError.message,
      code: interactionError.code ?? null,
      details: interactionError.details ?? null,
    });
    return res.status(500).json({ message: "interaction_lookup_failed", status: 500 });
  }

  if (!interaction) {
    logger.warn("feedback.interaction_not_found", { interaction_id: interactionId });
    return res.status(404).json({ message: "interaction_not_found", status: 404 });
  }

  const responseId =
    normalizeText(body.response_id) ??
    normalizeText(body.message_id) ??
    normalizeText(interaction.message_id) ??
    interactionId;

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

  const reason = normalizeText(body.reason);
  const timestamp = new Date().toISOString();
  const promptHash = normalizeText(interaction.prompt_hash as string | null | undefined);
  const userId = normalizeText((interaction.user_id as string | null | undefined) ?? null);
  const sessionId = normalizeText((interaction.session_id as string | null | undefined) ?? null);

  const feedbackPayload = {
    interaction_id: interactionId,
    message_id: responseId,
    vote,
    reason: reason ?? null,
    arm: armKey,
    pillar,
    prompt_hash: promptHash,
    user_id: userId,
    session_id: sessionId,
    timestamp,
  };

  const { error: feedbackError } = await analytics.from("eco_feedback").insert([feedbackPayload]);

  if (feedbackError) {
    const code = feedbackError.code ?? null;
    if (code === "23503") {
      logger.warn("feedback.persist_unknown_interaction", {
        interaction_id: interactionId,
        response_id: responseId,
        guest_id: guestIdHeader ?? null,
        message: feedbackError.message,
      });
      return res.status(404).json({ message: "interaction_not_found", status: 404 });
    }
    logger.error("feedback.persist_failed", {
      interaction_id: interactionId,
      message: feedbackError.message,
      code,
      details: feedbackError.details ?? null,
      table: "eco_feedback",
      payload: feedbackPayload,
      guest_id: guestIdHeader ?? null,
    });
    return res.status(500).json({ message: "feedback_store_failed", status: 500 });
  }

  logger.info("feedback.persist_success", {
    table: "eco_feedback",
    interaction_id: interactionId,
    response_id: responseId,
    vote,
    guest_id: guestIdHeader ?? null,
  });

  const rewardPayload = {
    response_id: interactionId,
    pilar: pillar,
    arm: armKey,
    recompensa: reward,
  };

  const { data: rewardRows, error: rewardError } = await analytics
    .from("bandit_rewards")
    .insert([rewardPayload])
    .select("response_id,arm");

  const rewardInserted = Array.isArray(rewardRows) && rewardRows.length > 0;

  if (rewardError) {
    logger.error("feedback.bandit_reward_failed", {
      response_id: responseId,
      arm: armKey,
      message: rewardError.message,
      code: rewardError.code ?? null,
      details: rewardError.details ?? null,
      table: "bandit_rewards",
      payload: rewardPayload,
    });
    return res.status(500).json({ message: "bandit_reward_failed", status: 500 });
  } else if (rewardInserted) {
    logger.info("feedback.bandit_reward_recorded", {
      table: "bandit_rewards",
      response_id: responseId,
      arm: armKey,
      reward,
    });
  } else {
    logger.info("feedback.bandit_reward_skipped", {
      table: "bandit_rewards",
      response_id: responseId,
      arm: armKey,
      reason: "duplicate",
    });
  }

  if (rewardInserted) {
    const rpcPayload = {
      arm_id: armKey,
      reward,
      p_arm_key: armKey,
      p_reward: reward,
    };
    const { error: rpcError } = await analytics.rpc("update_bandit_arm", rpcPayload);

    if (rpcError) {
      logger.error("feedback.bandit_arm_update_failed", {
        arm: armKey,
        message: rpcError.message,
        code: rpcError.code ?? null,
        details: rpcError.details ?? null,
        table: "eco_bandit_arms",
        payload: rpcPayload,
      });
      return res.status(500).json({ message: "bandit_arm_update_failed", status: 500 });
    } else {
      logger.info("feedback.bandit_arm_updated", {
        table: "eco_bandit_arms",
        arm: armKey,
        response_id: responseId,
        reward,
      });
    }
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
