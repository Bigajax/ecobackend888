import { Router, type Request, type Response } from "express";
import { z } from "zod";

import mixpanel from "../lib/mixpanel";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const router = Router();

const FeedbackSchema = z.object({
  messageId: z.string().min(1),
  userId: z.string().uuid().optional().nullable(),
  sessionId: z.string().min(1).optional().nullable(),
  vote: z.union([z.literal("up"), z.literal("down")]),
  reasons: z.array(z.string().min(1)).optional(),
  source: z.string().min(1).optional(),
  meta: z.record(z.unknown()).optional(),
});

const PassiveSignalSchema = z.object({
  messageId: z.string().min(1),
  signal: z.union([
    z.literal("copy"),
    z.literal("share"),
    z.literal("tts_60"),
    z.literal("read_complete"),
  ]),
  value: z.number().finite().optional(),
});

type FeedbackPayload = z.infer<typeof FeedbackSchema>;
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

async function updateBanditArm(params: {
  armKey: string;
  reward: number;
  supabase: ReturnType<typeof getSupabaseAdmin>;
}): Promise<void> {
  const { supabase, armKey, reward } = params;
  if (!supabase) return;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from("eco_bandit_arms")
      .select("arm_key, pulls, alpha, beta, reward_sum, reward_sq_sum")
      .eq("arm_key", armKey)
      .maybeSingle();

    if (fetchError) {
      log.warn("[feedbackRoutes] failed to fetch bandit arm", { error: fetchError.message, armKey });
      return;
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
      return;
    }

    try {
      mixpanel.track("BE:Bandit Update", { arm_key: armKey, r: reward, pulls });
    } catch (error) {
      log.warn("[feedbackRoutes] mixpanel bandit update failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    log.warn("[feedbackRoutes] unexpected bandit update error", {
      armKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleFeedback(req: Request, res: Response): Promise<void> {
  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    res.status(503).json({ error: "unavailable", details: "supabase_admin_not_configured" });
    return;
  }

  const { data: interaction, error: lookupError } = await supabase
    .from("eco_interactions")
    .select("id, module_combo")
    .eq("message_id", payload.messageId)
    .maybeSingle();

  if (lookupError) {
    log.warn("[feedbackRoutes] failed to find interaction", { error: lookupError.message });
    res.status(500).json({ error: "interaction_lookup_failed" });
    return;
  }

  const interactionId = (interaction as { id?: string } | null)?.id ?? null;
  if (!interactionId) {
    res.status(404).json({ error: "interaction_not_found" });
    return;
  }

  const reasons = sanitizeReasons(payload.reasons ?? undefined);

  const { error: upsertError } = await supabase.from("eco_feedback").upsert(
    {
      interaction_id: interactionId,
      user_id: payload.userId ?? null,
      session_id: payload.sessionId ?? null,
      vote: payload.vote,
      reason: reasons,
      source: payload.source ?? null,
      meta: payload.meta ?? null,
    },
    { onConflict: "interaction_id" }
  );

  if (upsertError) {
    log.warn("[feedbackRoutes] failed to upsert feedback", { error: upsertError.message });
    res.status(500).json({ error: "feedback_upsert_failed" });
    return;
  }

  const reward = computeReward({ vote: payload.vote, reasons: reasons ?? undefined });
  const armKey = resolveArmKey(payload.meta, (interaction as any)?.module_combo ?? null);
  if (armKey) {
    await updateBanditArm({ armKey, reward, supabase });
  }

  res.status(201).json({ ok: true, reward });
}

async function handleSignal(req: Request, res: Response): Promise<void> {
  const parsed = PassiveSignalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    res.status(503).json({ error: "unavailable", details: "supabase_admin_not_configured" });
    return;
  }

  const { data: interaction, error: lookupError } = await supabase
    .from("eco_interactions")
    .select("id")
    .eq("message_id", payload.messageId)
    .maybeSingle();

  if (lookupError) {
    log.warn("[feedbackRoutes] failed to find interaction for signal", { error: lookupError.message });
    res.status(500).json({ error: "interaction_lookup_failed" });
    return;
  }

  const interactionId = (interaction as { id?: string } | null)?.id ?? null;
  if (!interactionId) {
    res.status(404).json({ error: "interaction_not_found" });
    return;
  }

  const insertPayload = {
    interaction_id: interactionId,
    signal: payload.signal,
    value: typeof payload.value === "number" && Number.isFinite(payload.value) ? payload.value : null,
  };

  const { error: insertError } = await supabase.from("eco_passive_signals").insert(insertPayload);
  if (insertError) {
    log.warn("[feedbackRoutes] failed to insert passive signal", { error: insertError.message });
    res.status(500).json({ error: "signal_insert_failed" });
    return;
  }

  try {
    mixpanel.track("BE:Signal", {
      signal: payload.signal,
      value: insertPayload.value,
    });
  } catch (error) {
    log.warn("[feedbackRoutes] mixpanel signal failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  res.status(201).json({ ok: true });
}

router.post("/", (req, res) => {
  void handleFeedback(req, res);
});

const signalRouter = Router();

signalRouter.post("/", (req, res) => {
  void handleSignal(req, res);
});

export { signalRouter };
export default router;
