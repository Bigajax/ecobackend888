import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";

import type {
  FeedbackPayload,
  InteractionPayload,
  LatencyPayload,
} from "../../schemas/feedback";
import { log } from "../promptContext/logger";

const logger = log.withContext("analytics-supabase");

const RETRY_DELAYS_MS = [0, 150, 500];

let cachedClient: SupabaseClient | null = null;

function ensureClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase analytics client is not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  cachedClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
}

class AnalyticsInsertError extends Error {
  constructor(message: string, public context: string, public cause?: Record<string, unknown>) {
    super(message);
    this.name = "AnalyticsInsertError";
  }
}

function toNullableInteger(value: number | null | undefined): number | null {
  if (!Number.isFinite(value ?? NaN)) return null;
  return Math.trunc(value as number);
}

function toJson(value: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value;
  }
  return null;
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetry<T>(context: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      await wait(delay);
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isLast = attempt === RETRY_DELAYS_MS.length - 1;
      if (!isLast) {
        logger.warn("analytics.retry", {
          context,
          attempt: attempt + 1,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`Analytics operation failed: ${String(lastError)}`);
}

function mapPostgrestError(error: PostgrestError | null, context: string): AnalyticsInsertError {
  if (!error) {
    return new AnalyticsInsertError("Unknown analytics insert error", context);
  }
  return new AnalyticsInsertError(error.message, context, {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

export async function insertFeedback(payload: FeedbackPayload): Promise<void> {
  const client = ensureClient();
  const nowIso = new Date().toISOString();

  await runWithRetry("eco_feedback", async () => {
    const { error } = await client
      .schema("analytics")
      .from("eco_feedback")
      .insert([
        {
          interaction_id: payload.interaction_id,
          user_id: payload.user_id ?? null,
          session_id: payload.session_id ?? null,
          vote: payload.vote,
          reason: payload.reason ?? null,
          source: payload.source ?? null,
          meta: toJson(payload.meta),
          created_at: nowIso,
        },
      ]);

    if (error) {
      throw mapPostgrestError(error, "eco_feedback");
    }
  });
}

export async function insertInteraction(payload: InteractionPayload): Promise<void> {
  const client = ensureClient();
  const nowIso = new Date().toISOString();

  await runWithRetry("eco_interactions", async () => {
    const { error } = await client
      .schema("analytics")
      .from("eco_interactions")
      .upsert(
        [
          {
            id: payload.interaction_id,
            user_id: payload.user_id ?? null,
            session_id: payload.session_id ?? null,
            message_id: payload.message_id ?? null,
            prompt_hash: payload.prompt_hash ?? null,
            module_combo: Array.isArray(payload.module_combo) ? payload.module_combo : null,
            tokens_in: toNullableInteger(payload.tokens_in),
            tokens_out: toNullableInteger(payload.tokens_out),
            latency_ms: toNullableInteger(payload.latency_ms),
            meta: toJson(payload.meta),
            created_at: nowIso,
          },
        ],
        { onConflict: "id", ignoreDuplicates: true }
      );

    if (error) {
      throw mapPostgrestError(error, "eco_interactions");
    }
  });
}

export async function insertLatency(payload: LatencyPayload): Promise<void> {
  const client = ensureClient();
  const nowIso = new Date().toISOString();

  await runWithRetry("latency_samples", async () => {
    const { error } = await client
      .schema("analytics")
      .from("latency_samples")
      .insert([
        {
          response_id: payload.response_id,
          ttfb_ms: toNullableInteger(payload.ttfb_ms ?? null),
          ttlc_ms: toNullableInteger(payload.ttlc_ms ?? null),
          tokens_total: toNullableInteger(payload.tokens_total ?? null),
          created_at: nowIso,
        },
      ]);

    if (error) {
      throw mapPostgrestError(error, "latency_samples");
    }
  });
}
