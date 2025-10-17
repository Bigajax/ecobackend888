import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("policy-controller");

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

export async function upsertPolicyConfig(req: Request, res: Response) {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  const key = normalizeKey(body.key);
  const tokensBudget = normalizeInteger(body.tokens_budget ?? null);

  let configProvided = false;
  let configInvalid = false;
  let config: Record<string, unknown> | null = null;

  if (Object.prototype.hasOwnProperty.call(body, "config")) {
    configProvided = true;
    const rawConfig = body.config;

    if (rawConfig === null) {
      config = null;
    } else if (typeof rawConfig === "object" && !Array.isArray(rawConfig)) {
      config = rawConfig as Record<string, unknown>;
    } else if (typeof rawConfig === "string") {
      const trimmed = rawConfig.trim();
      if (!trimmed) {
        config = null;
      } else {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            config = parsed as Record<string, unknown>;
          } else {
            configInvalid = true;
          }
        } catch {
          configInvalid = true;
        }
      }
    } else {
      configInvalid = true;
    }
  }

  logger.info("policy.request", {
    route: "/api/policy",
    has_config: configProvided,
    has_tokens_budget: typeof tokensBudget === "number",
  });

  if (!key) {
    logger.info("policy.validation_error", { route: "/api/policy", error: "missing_key" });
    return res.status(400).json({ error: "missing_key" });
  }

  if (configInvalid) {
    logger.info("policy.validation_error", { route: "/api/policy", error: "invalid_config" });
    return res.status(400).json({ error: "invalid_config" });
  }

  const payload: Record<string, unknown> = {
    key,
    updated_at: new Date().toISOString(),
  };

  if (typeof tokensBudget === "number") {
    payload.tokens_budget = tokensBudget;
  }

  if (configProvided) {
    payload.config = config;
  }

  const analytics = getAnalyticsClient();
  const { error } = await analytics.from("eco_policy_config").upsert([payload], { onConflict: "key" });

  if (error) {
    logger.error("policy.upsert_error", {
      route: "/api/policy",
      message: error.message,
      code: error.code ?? null,
      details: error.details ?? null,
      table: "eco_policy_config",
      payload,
    });
    return res.status(500).json({ error: "internal_error" });
  }

  logger.info("policy.upsert", {
    route: "/api/policy",
    status: "updated",
    table: "eco_policy_config",
    key,
  });
  return res.status(204).end();
}
