import { createHash } from "node:crypto";

import { analyticsClientMode, getAnalyticsClient } from "../supabaseClient";
import { log } from "../promptContext/logger";

const logger = log.withContext("interaction-analytics");

let moduleUsageSupportsExtended: boolean | null = null;

export function sha1Hash(input: string | null | undefined): string {
  return createHash("sha1").update(String(input ?? "")).digest("hex");
}

export interface InteractionSeed {
  userId?: string | null;
  sessionId?: string | null;
  messageId?: string | null;
  promptHash?: string | null;
}

export interface InteractionUpdate {
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  moduleCombo?: string[] | null;
}

export interface ModuleUsageRow {
  moduleKey: string;
  tokens?: number | null;
  position?: number | null;
  armId?: string | null;
  family?: string | null;
  chosenBy?: "ts" | "baseline" | "shadow" | null;
  rewardKey?: string | null;
  stage?: string | null;
  userOrGuestId?: string | null;
}

function toNullableInteger(value: number | null | undefined): number | null {
  if (!Number.isFinite(value ?? NaN)) return null;
  return Math.trunc(value as number);
}

function sanitizeModuleCombo(combo: string[] | null | undefined): string[] | null {
  if (!Array.isArray(combo)) return null;
  const cleaned = combo
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return cleaned.length ? cleaned : [];
}

export async function createInteraction(seed: InteractionSeed): Promise<string | null> {
  if (analyticsClientMode !== "enabled") {
    return null;
  }

  try {
    const analytics = getAnalyticsClient();
    const { data, error } = await analytics
      .from("eco_interactions")
      .insert([
        {
          user_id: seed.userId ?? null,
          session_id: seed.sessionId ?? null,
          message_id: seed.messageId ?? null,
          prompt_hash: seed.promptHash ?? null,
          module_combo: null,
          tokens_in: null,
          tokens_out: null,
          latency_ms: null,
        },
      ])
      .select("id")
      .maybeSingle();

    if (error) {
      logger.error("interaction.create_failed", {
        message: error.message,
        code: error.code ?? null,
        table: "eco_interactions",
        payload: {
          user_id: seed.userId ?? null,
          session_id: seed.sessionId ?? null,
          message_id: seed.messageId ?? null,
          prompt_hash: seed.promptHash ?? null,
        },
      });
      return null;
    }

    const interactionId = (data as { id?: string } | null)?.id ?? null;
    if (!interactionId) {
      logger.warn("interaction.create_missing_id");
      return null;
    }

    logger.info("interaction.insert_success", {
      table: "eco_interactions",
      interaction_id: interactionId,
    });

    return interactionId;
  } catch (error) {
    logger.error("interaction.create_unexpected", {
      message: error instanceof Error ? error.message : String(error),
      table: "eco_interactions",
    });
    return null;
  }
}

export async function updateInteraction(
  interactionId: string,
  update: InteractionUpdate
): Promise<void> {
  if (analyticsClientMode !== "enabled") {
    return;
  }
  const payload: Record<string, unknown> = {};
  const tokensIn = toNullableInteger(update.tokensIn ?? null);
  const tokensOut = toNullableInteger(update.tokensOut ?? null);
  const latencyMs = toNullableInteger(update.latencyMs ?? null);
  const moduleCombo = sanitizeModuleCombo(update.moduleCombo ?? null);

  if (tokensIn !== null) payload.tokens_in = tokensIn;
  if (tokensOut !== null) payload.tokens_out = tokensOut;
  if (latencyMs !== null) payload.latency_ms = latencyMs;
  if (moduleCombo !== null) payload.module_combo = moduleCombo;

  if (Object.keys(payload).length === 0) {
    return;
  }

  try {
    const analytics = getAnalyticsClient();
    const { error } = await analytics
      .from("eco_interactions")
      .update(payload)
      .eq("id", interactionId);

    if (error) {
      logger.warn("interaction.update_failed", {
        interaction_id: interactionId,
        message: error.message,
        code: error.code ?? null,
      });
    }
  } catch (error) {
    logger.warn("interaction.update_unexpected", {
      interaction_id: interactionId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function insertModuleUsages(
  interactionId: string,
  usages: ModuleUsageRow[]
): Promise<void> {
  if (analyticsClientMode !== "enabled") {
    return;
  }
  if (!Array.isArray(usages) || usages.length === 0) {
    return;
  }

  const extendedRows = usages
    .map((usage) => {
      const moduleKey = typeof usage.moduleKey === "string" ? usage.moduleKey.trim() : "";
      if (!moduleKey) return null;
      const tokens = toNullableInteger(usage.tokens ?? null);
      const position = toNullableInteger(usage.position ?? null);
      const armIdRaw = typeof usage.armId === "string" ? usage.armId.trim() : "";
      const familyRaw = typeof usage.family === "string" ? usage.family.trim() : "";
      const rewardKeyRaw = typeof usage.rewardKey === "string" ? usage.rewardKey.trim() : "";
      const stageRaw = typeof usage.stage === "string" ? usage.stage.trim() : "";
      const userOrGuestRaw =
        typeof usage.userOrGuestId === "string" ? usage.userOrGuestId.trim() : "";
      const chosenBy =
        usage.chosenBy === "ts" || usage.chosenBy === "baseline" || usage.chosenBy === "shadow"
          ? usage.chosenBy
          : null;
      return {
        interaction_id: interactionId,
        module_key: moduleKey,
        arm_id: armIdRaw || moduleKey,
        family: familyRaw || null,
        tokens: tokens ?? 0,
        position: position ?? null,
        chosen_by: chosenBy,
        reward_key: rewardKeyRaw || null,
        stage: stageRaw || "stitch",
        user_or_guest_id: userOrGuestRaw || null,
      };
    })
    .filter(
      (row): row is {
        interaction_id: string;
        module_key: string;
        arm_id: string;
        family: string | null;
        tokens: number;
        position: number | null;
        chosen_by: "ts" | "baseline" | "shadow" | null;
        reward_key: string | null;
        stage: string;
        user_or_guest_id: string | null;
      } => row !== null
    );

  if (!extendedRows.length) return;

  const legacyRows = extendedRows.map((row) => ({
    interaction_id: row.interaction_id,
    module_key: row.module_key,
    tokens: row.tokens,
    position: row.position,
  }));

  try {
    const analytics = getAnalyticsClient();
    if (moduleUsageSupportsExtended === false) {
      const { error: legacyError } = await analytics
        .from("eco_module_usages")
        .insert(legacyRows);
      if (legacyError) {
        logger.error("interaction.module_usage_failed", {
          interaction_id: interactionId,
          message: legacyError.message,
          code: legacyError.code ?? null,
          table: "eco_module_usages",
          payload: legacyRows,
        });
      } else {
        logger.info("interaction.module_usage_inserted", {
          table: "eco_module_usages",
          interaction_id: interactionId,
          rows: legacyRows.length,
          mode: "legacy",
        });
      }
      return;
    }

    const { error } = await analytics.from("eco_module_usages").insert(extendedRows);
    if (error) {
      if (error.code === "42703") {
        moduleUsageSupportsExtended = false;
        logger.warn("interaction.module_usage_extended_unsupported", {
          interaction_id: interactionId,
          message: error.message,
        });
        const { error: legacyError } = await analytics
          .from("eco_module_usages")
          .insert(legacyRows);
        if (legacyError) {
          logger.error("interaction.module_usage_failed", {
            interaction_id: interactionId,
            message: legacyError.message,
            code: legacyError.code ?? null,
            table: "eco_module_usages",
            payload: legacyRows,
          });
        } else {
          logger.info("interaction.module_usage_inserted", {
            table: "eco_module_usages",
            interaction_id: interactionId,
            rows: legacyRows.length,
            mode: "legacy",
          });
        }
        return;
      }
      logger.error("interaction.module_usage_failed", {
        interaction_id: interactionId,
        message: error.message,
        code: error.code ?? null,
        table: "eco_module_usages",
        payload: extendedRows,
      });
      return;
    }

    moduleUsageSupportsExtended = true;
    logger.info("interaction.module_usage_inserted", {
      table: "eco_module_usages",
      interaction_id: interactionId,
      rows: extendedRows.length,
      mode: "extended",
    });
  } catch (error) {
    logger.error("interaction.module_usage_unexpected", {
      interaction_id: interactionId,
      message: error instanceof Error ? error.message : String(error),
      table: "eco_module_usages",
    });
  }
}
