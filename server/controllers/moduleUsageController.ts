import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("module-usage-controller");

function isValidUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    trimmed
  );
}

function normalizeModuleKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (!Number.isInteger(value)) return null;
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
    return parsed;
  }

  return null;
}

export async function registrarModuleUsage(req: Request, res: Response) {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  const rawInteractionId = body.interaction_id;
  const rawModuleKey = body.module_key;
  const moduleKey = normalizeModuleKey(rawModuleKey);
  const tokens = normalizeInteger(body.tokens ?? null);
  const position = normalizeInteger(body.position ?? null);
  const sessionId = normalizeSessionId(body.session_id ?? null);

  logger.info("module-usage.request", {
    route: "/api/module-usage",
    has_interaction_id: Boolean(rawInteractionId),
    has_session_id: Boolean(sessionId),
    module_key: moduleKey,
  });

  if (!rawInteractionId) {
    logger.info("module-usage.validation_error", {
      route: "/api/module-usage",
      error: "missing_interaction_id",
    });
    return res.status(400).json({ error: "missing_interaction_id" });
  }

  if (!moduleKey) {
    logger.info("module-usage.validation_error", {
      route: "/api/module-usage",
      error: "missing_module_key",
    });
    return res.status(400).json({ error: "missing_module_key" });
  }

  if (!isValidUuid(rawInteractionId)) {
    logger.info("module-usage.validation_error", {
      route: "/api/module-usage",
      error: "invalid_interaction_id",
    });
    return res.status(400).json({ error: "invalid_interaction_id" });
  }

  const analytics = getAnalyticsClient();

  const payload: Record<string, unknown> = {
    interaction_id: (rawInteractionId as string).trim(),
    module_key: moduleKey,
  };

  if (typeof tokens === "number") {
    payload.tokens = tokens;
  }

  if (typeof position === "number") {
    payload.position = position;
  }

  if (sessionId) {
    payload.session_id = sessionId;
  }

  const { error } = await analytics.from("eco_module_usages").insert([payload]);

  if (error) {
    if (error.code === "23503") {
      logger.info("module-usage.insert", {
        route: "/api/module-usage",
        status: "fk_not_found",
      });
      return res.status(404).json({ error: "interaction_not_found" });
    }

    logger.error("module-usage.insert_error", {
      route: "/api/module-usage",
      message: error.message,
      code: error.code ?? null,
      details: error.details ?? null,
    });
    return res.status(500).json({ error: "internal_error" });
  }

  logger.info("module-usage.insert", { route: "/api/module-usage", status: "created" });
  return res.status(204).end();
}
