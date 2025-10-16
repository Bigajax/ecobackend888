import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("bandit-arms-controller");

type RawArmPayload = Record<string, unknown>;

type ArmPayload = {
  arm_key: string;
  alpha: number | null;
  beta: number | null;
  pulls: number | null;
};

function normalizeArmKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeFloat(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function mapPayload(input: RawArmPayload): ArmPayload | null {
  const armKey = normalizeArmKey(input.arm_key);
  if (!armKey) return null;

  const alpha = normalizeFloat(input.alpha ?? null);
  const beta = normalizeFloat(input.beta ?? null);
  const pulls = normalizeInteger(input.pulls ?? null);

  return { arm_key: armKey, alpha, beta, pulls };
}

export async function upsertBanditArms(req: Request, res: Response) {
  const rawBody = req.body;
  const items = Array.isArray(rawBody)
    ? rawBody
    : rawBody && typeof rawBody === "object"
    ? [rawBody as RawArmPayload]
    : [];

  const mapped = items
    .map((item) => (item && typeof item === "object" ? mapPayload(item as RawArmPayload) : null))
    .filter((item): item is ArmPayload => Boolean(item));

  logger.info("bandit-arms.request", {
    route: "/api/bandit/arms",
    count: mapped.length,
  });

  if (!mapped.length) {
    logger.info("bandit-arms.validation_error", {
      route: "/api/bandit/arms",
      error: "empty_payload",
    });
    return res.status(400).json({ error: "invalid_payload" });
  }

  const updates = mapped.map((item) => {
    const update: Record<string, unknown> = {
      arm_key: item.arm_key,
      last_update: new Date().toISOString(),
    };

    if (typeof item.alpha === "number") {
      update.alpha = item.alpha;
    }

    if (typeof item.beta === "number") {
      update.beta = item.beta;
    }

    if (typeof item.pulls === "number") {
      update.pulls = item.pulls;
    }

    return update;
  });

  const analytics = getAnalyticsClient();
  const { error } = await analytics
    .from("eco_bandit_arms")
    .upsert(updates, { onConflict: "arm_key" });

  if (error) {
    logger.error("bandit-arms.upsert_error", {
      route: "/api/bandit/arms",
      message: error.message,
      code: error.code ?? null,
      details: error.details ?? null,
    });
    return res.status(500).json({ error: "internal_error" });
  }

  logger.info("bandit-arms.upsert", { route: "/api/bandit/arms", status: "updated", count: updates.length });
  return res.status(204).end();
}
