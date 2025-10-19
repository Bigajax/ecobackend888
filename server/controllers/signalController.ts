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

function respondMissingParams(res: Response) {
  return res.status(400).json({ error: { code: "MISSING_PARAMS" } });
}

function respondSignalStoreDisabled(res: Response) {
  return res.status(501).json({ error: { code: "SIGNAL_STORE_DISABLED" } });
}

function isStorageDisabled(error: { code?: string | null; message: string }) {
  const code = error.code ?? "";
  if (code === "42P01" || code === "42703") return true;
  const message = error.message?.toLowerCase?.() ?? "";
  return message.includes("does not exist") || message.includes("missing column");
}

export async function registrarSignal(req: Request, res: Response) {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  const rawSignal = normalizeSignal(body.signal ?? null);
  const rawInteractionId = body.interaction_id;
  const userOrGuest = normalizeSignal(body.user_or_guest ?? null);

  logger.info({
    tag: "signal_request",
    signal: rawSignal ?? null,
    has_interaction_id: Boolean(rawInteractionId),
    user_or_guest: userOrGuest ?? null,
  });

  if (!rawSignal || !rawInteractionId || !userOrGuest) {
    return respondMissingParams(res);
  }

  if (!isValidUuid(rawInteractionId)) {
    logger.warn("signal.invalid_interaction_id", {
      signal: rawSignal,
      interaction_id: rawInteractionId,
    });
    return res.status(400).json({ error: { code: "INVALID_INTERACTION_ID" } });
  }

  const interactionId = (rawInteractionId as string).trim();
  const meta = { ...sanitizeMeta(body.meta), user_or_guest: userOrGuest };

  const analytics = getAnalyticsClient();
  if (!analytics) {
    logger.warn("signal.store_unavailable", { reason: "analytics_client_missing" });
    return respondSignalStoreDisabled(res);
  }

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

  if (isStorageDisabled(error)) {
    logger.warn("signal.store_disabled", {
      signal: rawSignal,
      interaction_id: interactionId,
      message: error.message,
      code: error.code ?? null,
    });
    return respondSignalStoreDisabled(res);
  }

  if (error.code === "23503") {
    logger.error("signal.persist.fk_violation", {
      signal: rawSignal,
      interaction_id: interactionId,
      message: error.message,
      table: "eco_passive_signals",
      payload,
    });
    return res.status(404).json({ error: { code: "INTERACTION_NOT_FOUND" } });
  }

  logger.error("signal.persist.error", {
    signal: rawSignal,
    interaction_id: interactionId,
    message: error.message,
    code: error.code ?? null,
    table: "eco_passive_signals",
    payload,
  });

  return res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
}
