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

function sanitizeMeta(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

export async function registrarSignal(req: Request, res: Response) {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  const rawSignal = normalizeSignal(body.signal ?? null);
  const rawInteractionId = body.interaction_id;

  logger.info({ tag: "signal_request", signal: rawSignal ?? null, has_interaction_id: Boolean(rawInteractionId) });

  if (!rawSignal) {
    return res.status(400).json({ error: "missing_signal" });
  }

  if (!rawInteractionId) {
    logger.warn("signal.missing_interaction_id", { signal: rawSignal });
    return res.status(400).json({ error: "missing_interaction_id" });
  }

  if (!isValidUuid(rawInteractionId)) {
    logger.warn("signal.invalid_interaction_id", { signal: rawSignal, interaction_id: rawInteractionId });
    return res.status(400).json({ error: "invalid_interaction_id" });
  }

  const interactionId = (rawInteractionId as string).trim();
  const meta = sanitizeMeta(body.meta);

  const analytics = getAnalyticsClient();

  const payload = {
    interaction_id: interactionId,
    signal: rawSignal,
    meta,
  };

  const { error } = await analytics.from("eco_passive_signals").insert([payload]);

  if (!error) {
    logger.info("signal.persisted", {
      signal: rawSignal,
      status: "created",
      degraded: false,
      table: "eco_passive_signals",
      interaction_id: interactionId,
    });
    return res.status(204).end();
  }

  if (error.code === "23503") {
    logger.error("signal.persist.fk_violation", {
      signal: rawSignal,
      interaction_id: interactionId,
      message: error.message,
      table: "eco_passive_signals",
      payload,
    });
    return res.status(404).json({ error: "interaction_not_found" });
  }

  logger.error("signal.persist.error", {
    signal: rawSignal,
    interaction_id: interactionId,
    message: error.message,
    code: error.code ?? null,
    table: "eco_passive_signals",
    payload,
  });

  return res.status(500).json({ error: "internal_error" });
}
