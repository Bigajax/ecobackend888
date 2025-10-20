import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";
import { applyCorsResponseHeaders } from "../middleware/cors";

const logger = log.withContext("signal-controller");

const LIFECYCLE_SIGNALS = new Set(["first_token", "prompt_ready", "done"]);
const STRICT_INTERACTION_SIGNALS = new Set(["view", "time_on_message", "tts_play"]);

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

function respondSignalStoreDisabled(res: Response) {
  return res.status(501).json({ error: { code: "SIGNAL_STORE_DISABLED" } });
}

function respondNoContent(res: Response) {
  return res.status(204).end();
}

function isStorageDisabled(error: { code?: string | null; message: string }) {
  const code = error.code ?? "";
  if (code === "42P01" || code === "42703") return true;
  const message = error.message?.toLowerCase?.() ?? "";
  return message.includes("does not exist") || message.includes("missing column");
}

export async function registrarSignal(req: Request, res: Response) {
  applyCorsResponseHeaders(req, res);
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  const rawSignal = normalizeSignal(body.signal ?? null);
  const rawInteractionId = typeof body.interaction_id === "string" ? body.interaction_id : null;
  const userOrGuest = normalizeSignal(body.user_or_guest ?? null);

  const guestIdHeader = normalizeSignal(req.get("X-Eco-Guest-Id") ?? req.get("X-Guest-Id"));
  const sessionIdHeader = normalizeSignal(req.get("X-Eco-Session-Id") ?? req.get("X-Session-Id"));

  const noop = (reason: string) => {
    logger.warn("signal.ignored", {
      reason,
      signal: rawSignal ?? null,
      has_interaction_id: Boolean(rawInteractionId),
      user_or_guest: userOrGuest ?? null,
      guest_id_header: guestIdHeader ?? null,
      session_id_header: sessionIdHeader ?? null,
    });
    return respondNoContent(res);
  };

  logger.info({
    tag: "signal_request",
    signal: rawSignal ?? null,
    has_interaction_id: Boolean(rawInteractionId),
    user_or_guest: userOrGuest ?? null,
    guest_id: guestIdHeader ?? null,
    session_id: sessionIdHeader ?? null,
  });

  if (!rawSignal) {
    return noop("missing_signal");
  }

  const signalKey = rawSignal.toLowerCase();

  if (!rawInteractionId) {
    if (LIFECYCLE_SIGNALS.has(signalKey)) {
      logger.debug("signal.lifecycle_missing_interaction", {
        signal: rawSignal,
        guest_id: guestIdHeader ?? null,
      });
      return respondNoContent(res);
    }
    if (STRICT_INTERACTION_SIGNALS.has(signalKey)) {
      logger.warn("signal.missing_interaction_id", {
        signal: rawSignal,
        guest_id: guestIdHeader ?? null,
      });
      return res.status(400).json({ error: "missing_interaction_id" });
    }
    return noop("missing_interaction_id");
  }

  if (!isValidUuid(rawInteractionId)) {
    logger.warn("signal.invalid_interaction_id", {
      signal: rawSignal,
      interaction_id: rawInteractionId,
    });
    return noop("invalid_interaction_id");
  }

  const interactionId = (rawInteractionId as string).trim();
  const meta = {
    ...sanitizeMeta(body.meta),
    ...(userOrGuest ? { user_or_guest: userOrGuest } : {}),
    ...(guestIdHeader ? { guest_id_header: guestIdHeader } : {}),
    ...(sessionIdHeader ? { session_id_header: sessionIdHeader } : {}),
  };

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
    return respondNoContent(res);
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
