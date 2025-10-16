import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("signal-controller");

function isValidUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(trimmed);
}

function normalizeSignal(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNumeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function registrarSignal(req: Request, res: Response) {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  const rawSignal = normalizeSignal(body.signal ?? null);
  const rawInteractionId = body.interaction_id;
  const rawSessionId = body.session_id;
  const numericValue = normalizeNumeric(body.value ?? null);

  logger.info("signal.request.received", {
    signal: rawSignal ?? null,
    has_interaction_id: Boolean(rawInteractionId),
    has_session_id: Boolean(rawSessionId),
  });

  if (!rawSignal) {
    return res.status(400).json({ error: "missing_signal" });
  }

  const interactionId = isValidUuid(rawInteractionId) ? (rawInteractionId as string).trim() : null;
  const sessionId = normalizeSessionId(rawSessionId);

  const analytics = getAnalyticsClient();

  const payload = {
    interaction_id: interactionId,
    signal: rawSignal,
    value: numericValue,
    session_id: sessionId,
  };

  const { error } = await analytics.from("eco_passive_signals").insert([payload]);

  if (!error) {
    logger.info("signal.persisted", { signal: rawSignal, status: "created", degraded: false });
    return res.status(204).end();
  }

  if (error.code === "23503" && interactionId) {
    logger.warn("signal.persist.fk_violation", {
      signal: rawSignal,
      interaction_id: interactionId,
      message: error.message,
    });

    const degradedPayload = { ...payload, interaction_id: null };
    const { error: degradedError } = await analytics
      .from("eco_passive_signals")
      .insert([degradedPayload]);

    if (degradedError) {
      logger.error("signal.persist.degrade_failed", {
        signal: rawSignal,
        interaction_id: interactionId,
        message: degradedError.message,
        code: degradedError.code ?? null,
      });
      return res.status(204).end();
    }

    logger.info("signal.persisted", { signal: rawSignal, status: "created", degraded: true });
    return res.status(204).end();
  }

  logger.error("signal.persist.error", {
    signal: rawSignal,
    interaction_id: interactionId,
    message: error.message,
    code: error.code ?? null,
  });

  return res.status(500).json({ error: "internal_error" });
}
