import { Router, type Request, type Response } from "express";

import {
  FeedbackPayloadSchema,
  InteractionPayloadSchema,
  LatencyPayloadSchema,
  type FeedbackPayload,
  type InteractionPayload,
  type LatencyPayload,
} from "../schemas/feedback";
import {
  insertFeedback,
  insertInteraction,
  insertLatency,
} from "../services/supabase/analyticsClient";
import { log } from "../services/promptContext/logger";

const router = Router();
const logger = log.withContext("feedback-routes");

const INVALID_STATUS = 400;
const UPSERT_ERROR_STATUS = 502;

type ErrorBody = {
  code: "INVALID_PAYLOAD" | "SUPABASE_INSERT_FAILED";
  issues?: unknown;
};

function getGuestId(req: Request): string | null {
  const header = req.header("x-guest-id");
  return typeof header === "string" && header.trim().length > 0 ? header.trim() : null;
}

function normalizeFeedback(payload: FeedbackPayload): FeedbackPayload {
  return {
    ...payload,
    user_id: payload.user_id ?? null,
    session_id: payload.session_id ?? null,
  };
}

function normalizeInteraction(payload: InteractionPayload): InteractionPayload {
  return {
    ...payload,
    user_id: payload.user_id ?? null,
    session_id: payload.session_id ?? null,
  };
}

async function handleFeedback(req: Request, res: Response<ErrorBody | void>): Promise<void> {
  const guestId = getGuestId(req);
  const parsed = FeedbackPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    logger.warn("feedback.invalid_payload", { issues: parsed.error.flatten().fieldErrors });
    res.status(INVALID_STATUS).json({ code: "INVALID_PAYLOAD", issues: parsed.error.flatten() });
    return;
  }

  const payload = normalizeFeedback(parsed.data);

  try {
    await insertFeedback(payload);
    logger.info("feedback.recorded", {
      interaction_id: payload.interaction_id,
      vote: payload.vote,
      guest: Boolean(guestId),
      source: payload.source ?? null,
    });
    res.status(204).end();
  } catch (error) {
    logger.warn("feedback.insert_failed", {
      interaction_id: payload.interaction_id,
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(UPSERT_ERROR_STATUS).json({ code: "SUPABASE_INSERT_FAILED" });
  }
}

async function handleInteraction(req: Request, res: Response<ErrorBody | { id: string }>): Promise<void> {
  const guestId = getGuestId(req);
  const parsed = InteractionPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    logger.warn("interaction.invalid_payload", { issues: parsed.error.flatten().fieldErrors });
    res.status(INVALID_STATUS).json({ code: "INVALID_PAYLOAD", issues: parsed.error.flatten() });
    return;
  }

  const payload = normalizeInteraction(parsed.data);

  try {
    await insertInteraction(payload);
    logger.info("interaction.recorded", {
      interaction_id: payload.interaction_id,
      module_combo: payload.module_combo?.length ?? 0,
      guest: Boolean(guestId),
    });
    res.status(201).json({ id: payload.interaction_id });
  } catch (error) {
    logger.warn("interaction.insert_failed", {
      interaction_id: payload.interaction_id,
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(UPSERT_ERROR_STATUS).json({ code: "SUPABASE_INSERT_FAILED" });
  }
}

async function handleLatency(req: Request, res: Response<ErrorBody | void>): Promise<void> {
  const parsed = LatencyPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    logger.warn("latency.invalid_payload", { issues: parsed.error.flatten().fieldErrors });
    res.status(INVALID_STATUS).json({ code: "INVALID_PAYLOAD", issues: parsed.error.flatten() });
    return;
  }

  const payload: LatencyPayload = parsed.data;

  try {
    await insertLatency(payload);
    logger.info("latency.recorded", { response_id: payload.response_id });
    res.status(204).end();
  } catch (error) {
    logger.warn("latency.insert_failed", {
      response_id: payload.response_id,
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(UPSERT_ERROR_STATUS).json({ code: "SUPABASE_INSERT_FAILED" });
  }
}

router.post("/feedback", (req, res) => {
  void handleFeedback(req, res);
});

router.post("/interaction", (req, res) => {
  void handleInteraction(req, res);
});

router.post("/latency", (req, res) => {
  void handleLatency(req, res);
});

export default router;
