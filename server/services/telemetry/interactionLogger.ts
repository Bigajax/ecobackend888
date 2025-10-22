import type { AnySupabase } from "../../adapters/SupabaseAdapter";
import { log } from "../promptContext/logger";

export interface InteractionLogInput {
  userId?: string | null;
  sessionId?: string | null;
  messageId?: string | null;
  promptHash?: string | null;
  moduleCombo?: string[];
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
}

export interface ModuleUsageLogInput {
  moduleKey: string;
  tokens?: number | null;
  position?: number | null;
}

export async function logInteraction({
  supabase,
  interaction,
  moduleUsages = [],
}: {
  supabase: AnySupabase;
  interaction: InteractionLogInput;
  moduleUsages?: ModuleUsageLogInput[];
}): Promise<string | null> {
  try {
    const nowIso = new Date().toISOString();
    const normalizedMessageId =
      typeof interaction.messageId === "string" && interaction.messageId.trim().length
        ? interaction.messageId.trim()
        : null;
    const payload = {
      user_id: interaction.userId ?? null,
      session_id: interaction.sessionId ?? null,
      message_id: normalizedMessageId,
      prompt_hash: interaction.promptHash ?? null,
      module_combo:
        Array.isArray(interaction.moduleCombo) && interaction.moduleCombo.length
          ? interaction.moduleCombo
          : [],
      tokens_in: Number.isFinite(interaction.tokensIn ?? NaN)
        ? Math.trunc(interaction.tokensIn as number)
        : null,
      tokens_out: Number.isFinite(interaction.tokensOut ?? NaN)
        ? Math.trunc(interaction.tokensOut as number)
        : null,
      latency_ms: Number.isFinite(interaction.latencyMs ?? NaN)
        ? Math.trunc(interaction.latencyMs as number)
        : null,
      created_at: nowIso,
    };

    const analytics = supabase.schema("analytics");

    const { data, error } = await analytics
      .from("eco_interactions")
      .upsert([payload], { onConflict: "message_id", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (error) {
      log.error("[interactionLogger] failed to insert eco_interactions", {
        message: error.message,
        code: error.code ?? null,
        payload,
      });
      return null;
    }

    const interactionId = (data as { id?: string } | null)?.id ?? null;
    if (!interactionId) {
      if (!normalizedMessageId) {
        return null;
      }

      const { data: existing, error: lookupError } = await analytics
        .from("eco_interactions")
        .select("id")
        .eq("message_id", normalizedMessageId)
        .maybeSingle();

      if (lookupError) {
        log.warn("[interactionLogger] lookup_failed", {
          message: lookupError.message,
          code: lookupError.code ?? null,
          payload: { message_id: normalizedMessageId },
        });
        return null;
      }

      const reusedId = (existing as { id?: string } | null)?.id ?? null;
      if (!reusedId) {
        log.warn("[interactionLogger] lookup_missing_id", {
          payload: { message_id: normalizedMessageId },
        });
        return null;
      }

      log.info("[interactionLogger] reused_existing", {
        tabela: "eco_interactions",
        interaction_id: reusedId,
      });
      return reusedId;
    }

    log.info("[interactionLogger] insert_success", {
      tabela: "eco_interactions",
      interaction_id: interactionId,
    });

    if (Array.isArray(moduleUsages) && moduleUsages.length) {
      const rows = moduleUsages
        .map((usage) => {
          const moduleKey = typeof usage.moduleKey === "string" ? usage.moduleKey : "";
          if (!moduleKey) return null;
          return {
            interaction_id: interactionId,
            module_key: moduleKey,
            tokens:
              Number.isFinite(usage.tokens ?? NaN) && usage.tokens != null
                ? Math.trunc(usage.tokens as number)
                : null,
            position:
              Number.isFinite(usage.position ?? NaN) && usage.position != null
                ? Math.trunc(usage.position as number)
                : null,
            created_at: nowIso,
          };
        })
        .filter((row): row is {
          interaction_id: string;
          module_key: string;
          tokens: number | null;
          position: number | null;
          created_at: string;
        } => row !== null);

      if (rows.length) {
        const { error: moduleError } = await analytics
          .from("eco_module_usages")
          .insert(rows);
        if (moduleError) {
          log.error("[interactionLogger] failed to insert eco_module_usages", {
            message: moduleError.message,
            code: moduleError.code ?? null,
            payload: rows,
          });
        } else {
          log.info("[interactionLogger] insert_success", {
            tabela: "eco_module_usages",
            interaction_id: interactionId,
            rows: rows.length,
          });
        }
      }
    }

    return interactionId;
  } catch (error) {
    log.error("[interactionLogger] unexpected failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
