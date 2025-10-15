import { Router, type Request, type Response } from "express";
import { z } from "zod";

import mixpanel from "../lib/mixpanel";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const router = Router();
const signalRouter = Router();

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const FeedbackSchema = z.object({
  messageId: z.string().min(1).optional(),
  userId: z.string().uuid().optional().nullable(),
  sessionId: z.string().min(1).optional().nullable(),
  vote: z.union([z.literal("up"), z.literal("down")]),
  reasons: z.array(z.string().min(1)).optional(),
  source: z.string().min(1).optional(),
  meta: z.record(z.unknown()).optional(),
});

const PassiveSignalSchema = z.object({
  messageId: z.string().min(1).optional(),
  signal: z.union([
    z.literal("copy"),
    z.literal("share"),
    z.literal("tts_60"),
    z.literal("read_complete"),
  ]),
  value: z.number().finite().optional(),
  sessionId: z.string().min(1).optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
});

type FeedbackPayload = z.infer<typeof FeedbackSchema>;
type InteractionResolution =
  | { kind: "ok"; id: string; moduleCombo: string[] | null }
  | { kind: "not_found" }
  | { kind: "missing_identity" }
  | { kind: "error"; message: string };

const REASON_DELTAS = new Map<string, number>([
  ["too_long", -0.1],
  ["off_topic", -0.2],
  ["shallow", -0.1],
]);

function computeReward({ vote, reasons }: { vote: "up" | "down"; reasons?: string[] }): number {
  let reward = vote === "up" ? 1 : 0;
  if (Array.isArray(reasons)) {
    for (const reason of reasons) {
      const normalized = typeof reason === "string" ? reason.trim().toLowerCase() : "";
      if (!normalized) continue;
      const delta = REASON_DELTAS.get(normalized);
      if (typeof delta === "number") {
        reward += delta;
      }
    }
  }
  if (!Number.isFinite(reward)) return vote === "up" ? 1 : 0;
  if (reward < 0) return 0;
  if (reward > 1) return 1;
  return reward;
}

function sanitizeReasons(reasons?: string[]): string[] | null {
  if (!Array.isArray(reasons) || reasons.length === 0) return null;
  const cleaned = reasons
    .map((reason) => (typeof reason === "string" ? reason.trim() : ""))
    .filter((reason) => reason.length > 0);
  return cleaned.length ? cleaned : null;
}

function safePayloadSize(body: unknown): number | null {
  try {
    const serialized = JSON.stringify(body ?? null);
    return typeof serialized === "string" ? Buffer.byteLength(serialized, "utf8") : null;
  } catch (error) {
    log.warn("[feedbackRoutes] payload_size_serialization_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function resolveInteraction(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  payload: { messageId?: string | null; sessionId?: string | null; userId?: string | null }
): Promise<InteractionResolution> {
  if (!supabase) {
    return { kind: "error", message: "supabase_not_configured" };
  }

  const { messageId, sessionId, userId } = payload;

  try {
    if (messageId) {
      const { data, error } = await supabase
        .from("eco_interactions")
        .select("id, module_combo")
        .eq("message_id", messageId)
        .maybeSingle();

      if (error) {
        return { kind: "error", message: error.message };
      }
      const interactionId = (data as { id?: string } | null)?.id ?? null;
      if (!interactionId) {
        return { kind: "not_found" };
      }
      return {
        kind: "ok",
        id: interactionId,
        moduleCombo: (data as { module_combo?: string[] | null } | null)?.module_combo ?? null,
      };
    }

    if (!sessionId && !userId) {
      return { kind: "missing_identity" };
    }

    const cutoff = new Date(Date.now() - TEN_MINUTES_MS).toISOString();

    let query = supabase
      .from("eco_interactions")
      .select("id, module_combo, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessionId) {
      query = query.eq("session_id", sessionId);
    }
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return { kind: "error", message: error.message };
    }

    const interactionId = (data as { id?: string } | null)?.id ?? null;
    if (!interactionId) {
      return { kind: "not_found" };
    }

    return {
      kind: "ok",
      id: interactionId,
      moduleCombo: (data as { module_combo?: string[] | null } | null)?.module_combo ?? null,
    };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

function logRequest(
  route: "feedback" | "signal",
  meta: {
    origin: string | null;
    path: string;
    status: number;
    errorCode: string | null;
    supabaseError: string | null;
    payloadSize: number | null;
  }
) {
  log.info(`[${route}] handled`, meta);
}

async function handleFeedback(req: Request, res: Response): Promise<void> {
  const origin = (req.headers.origin as string | undefined) ?? null;
  const payloadSize = safePayloadSize(req.body);
  let status = 500;
  let errorCode: string | null = null;
  let supabaseError: string | null = null;

  try {
    const parsed = FeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      status = 400;
      errorCode = "invalid_payload";
      res.status(status).json({ error: errorCode, details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      status = 502;
      errorCode = "supabase_unconfigured";
      res.status(status).json({ error: errorCode, details: "supabase_admin_not_configured" });
      return;
    }

    const interactionResolution = await resolveInteraction(supabase, {
      messageId: payload.messageId ?? null,
      sessionId: payload.sessionId ?? null,
      userId: payload.userId ?? null,
    });

    if (interactionResolution.kind === "error") {
      status = 502;
      errorCode = "supabase_error";
      supabaseError = interactionResolution.message;
      res.status(status).json({ error: errorCode, details: interactionResolution.message });
      return;
    }

    if (interactionResolution.kind === "missing_identity") {
      status = 400;
      errorCode = "interaction_not_found";
      res.status(status).json({ error: errorCode, details: "missing_session_or_user" });
      return;
    }

    if (interactionResolution.kind === "not_found") {
      status = 400;
      errorCode = "interaction_not_found";
      res.status(status).json({ error: errorCode });
      return;
    }

    const interactionId = interactionResolution.id;
    const moduleCombo = interactionResolution.moduleCombo;

    const sanitizedReasons = sanitizeReasons(payload.reasons);
    const rating = payload.vote === "up" ? 1 : -1;
    const reward = computeReward({ vote: payload.vote, reasons: sanitizedReasons ?? undefined });

    const { error: upsertError } = await supabase
      .from("eco_feedback")
      .upsert(
        {
          interaction_id: interactionId,
          user_id: payload.userId ?? null,
          session_id: payload.sessionId ?? null,
          vote: payload.vote,
          rating,
          reason: sanitizedReasons,
          source: payload.source ?? null,
          meta: payload.meta ?? null,
        },
        { onConflict: "interaction_id" }
      );

    if (upsertError) {
      status = 502;
      errorCode = "feedback_upsert_failed";
      supabaseError = upsertError.message;
      res.status(status).json({ error: errorCode, details: upsertError.message });
      return;
    }

    let warn: string | undefined;
    if (moduleCombo) {
      const armKey = resolveArmKey(payload.meta, moduleCombo);
      if (armKey) {
        const updated = await updateBanditArm({ armKey, reward, supabase });
        if (!updated) {
          warn = "reward_update_failed";
        }
      }
    }

    try {
      mixpanel.track("BE:Feedback", {
        vote: payload.vote,
        rating,
        reward,
        interaction_id: interactionId,
        origin,
      });
    } catch (error) {
      log.warn("[feedbackRoutes] mixpanel feedback failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    status = 200;
    const responseBody: Record<string, unknown> = { ok: true, rating, reward };
    if (warn) responseBody.warn = warn;
    res.status(status).json(responseBody);
  } catch (error) {
    status = 502;
    errorCode = "unexpected_error";
    const message = error instanceof Error ? error.message : String(error);
    supabaseError = message;
    res.status(status).json({ error: errorCode, details: message });
  } finally {
    logRequest("feedback", {
      origin,
      path: req.path,
      status,
      errorCode,
      supabaseError,
      payloadSize,
    });
  }
}

async function handleSignal(req: Request, res: Response): Promise<void> {
  const origin = (req.headers.origin as string | undefined) ?? null;
  const payloadSize = safePayloadSize(req.body);
  let status = 500;
  let errorCode: string | null = null;
  let supabaseError: string | null = null;

  try {
    const parsed = PassiveSignalSchema.safeParse(req.body);
    if (!parsed.success) {
      status = 400;
      errorCode = "invalid_payload";
      res.status(status).json({ error: errorCode, details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      status = 502;
      errorCode = "supabase_unconfigured";
      res.status(status).json({ error: errorCode, details: "supabase_admin_not_configured" });
      return;
    }

    const interactionResolution = await resolveInteraction(supabase, {
      messageId: payload.messageId ?? null,
      sessionId: payload.sessionId ?? null,
      userId: payload.userId ?? null,
    });

    if (interactionResolution.kind === "error") {
      status = 202;
      errorCode = "supabase_error";
      supabaseError = interactionResolution.message;
      res.status(status).json({ ok: true, skipped: "supabase_error" });
      return;
    }

    if (interactionResolution.kind === "missing_identity" || interactionResolution.kind === "not_found") {
      status = 202;
      errorCode = "no_interaction";
      res.status(status).json({ ok: true, skipped: "no_interaction" });
      return;
    }

    const interactionId = interactionResolution.id;
    const cutoff = new Date(Date.now() - FIVE_MINUTES_MS).toISOString();

    const { data: existing, error: existingError } = await supabase
      .from("eco_passive_signals")
      .select("id, created_at, value")
      .eq("interaction_id", interactionId)
      .eq("signal", payload.signal)
      .gte("created_at", cutoff)
      .maybeSingle();

    if (existingError) {
      status = 202;
      errorCode = "signal_lookup_failed";
      supabaseError = existingError.message;
      res.status(status).json({ ok: true, skipped: "supabase_error" });
      return;
    }

    if (existing) {
      status = 202;
      errorCode = "duplicate_signal";
      res.status(status).json({ ok: true, skipped: "duplicate" });
      return;
    }

    const insertPayload = {
      interaction_id: interactionId,
      signal: payload.signal,
      value:
        typeof payload.value === "number" && Number.isFinite(payload.value)
          ? payload.value
          : null,
    };

    const { error: insertError } = await supabase
      .from("eco_passive_signals")
      .upsert(insertPayload, { onConflict: "interaction_id, signal" });

    if (insertError) {
      status = 202;
      errorCode = "signal_insert_failed";
      supabaseError = insertError.message;
      res.status(status).json({ ok: true, skipped: "supabase_error" });
      return;
    }

    try {
      mixpanel.track("BE:Signal", {
        signal: payload.signal,
        value: insertPayload.value,
        interaction_id: interactionId,
        origin,
      });
    } catch (error) {
      log.warn("[feedbackRoutes] mixpanel signal failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    status = 200;
    res.status(status).json({ ok: true });
  } catch (error) {
    status = 202;
    errorCode = "unexpected_error";
    const message = error instanceof Error ? error.message : String(error);
    supabaseError = message;
    res.status(status).json({ ok: true, skipped: "unexpected_error" });
  } finally {
    logRequest("signal", {
      origin,
      path: req.path,
      status,
      errorCode,
      supabaseError,
      payloadSize,
    });
  }
}

async function updateBanditArm(params: {
  armKey: string;
  reward: number;
  supabase: ReturnType<typeof getSupabaseAdmin>;
}): Promise<boolean> {
  const { supabase, armKey, reward } = params;
  if (!supabase) return false;

  const { data: existing, error: fetchError } = await supabase
    .from("eco_bandit_arms")
    .select("arm_key, pulls, alpha, beta, reward_sum, reward_sq_sum")
    .eq("arm_key", armKey)
    .maybeSingle();

  if (fetchError) {
    log.warn("[feedbackRoutes] failed to fetch bandit arm", { error: fetchError.message, armKey });
    return false;
  }

  const pulls = Number(existing?.pulls ?? 0) + 1;
  const alpha = Number(existing?.alpha ?? 1) + reward;
  const beta = Number(existing?.beta ?? 1) + (1 - reward);
  const rewardSum = Number(existing?.reward_sum ?? 0) + reward;
  const rewardSqSum = Number(existing?.reward_sq_sum ?? 0) + reward * reward;

  const payload = {
    arm_key: armKey,
    pulls,
    alpha,
    beta,
    reward_sum: rewardSum,
    reward_sq_sum: rewardSqSum,
    last_update: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("eco_bandit_arms")
    .upsert(payload, { onConflict: "arm_key" });

  if (upsertError) {
    log.warn("[feedbackRoutes] failed to upsert bandit arm", {
      error: upsertError.message,
      armKey,
    });
    return false;
  }

  try {
    mixpanel.track("BE:Bandit Update", { arm_key: armKey, r: reward, pulls });
  } catch (error) {
    log.warn("[feedbackRoutes] mixpanel bandit update failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return true;
}

function resolveArmKey(meta: FeedbackPayload["meta"], moduleCombo?: string[] | null): string | null {
  if (meta && typeof meta === "object") {
    const direct = (meta as Record<string, unknown>).armKey;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const snake = (meta as Record<string, unknown>).arm_key;
    if (typeof snake === "string" && snake.trim()) return snake.trim();
    const module = (meta as Record<string, unknown>).module;
    if (typeof module === "string" && module.trim()) return module.trim();
  }

  if (Array.isArray(moduleCombo) && moduleCombo.length === 1) {
    const [only] = moduleCombo;
    if (typeof only === "string" && only.trim()) return only.trim();
  }

  return null;
}

router.post("/", (req, res) => {
  void handleFeedback(req, res);
});

signalRouter.post("/", (req, res) => {
  void handleSignal(req, res);
});

export { signalRouter };
export default router;
