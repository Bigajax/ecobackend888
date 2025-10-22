import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";
import { applyCorsResponseHeaders } from "../middleware/cors";

const logger = log.withContext("signal-controller");

type SignalBody = Record<string, unknown>;

type NormalizedSignal = {
  type: string;
  name: string;
  interaction_id?: string;
  response_id?: string;
  user_id?: string;
  guest_id?: string;
  meta?: Record<string, unknown>;
  ts: string;
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizeMeta(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function normalizeBody(body: SignalBody, headers: { guestId?: string; sessionId?: string }): NormalizedSignal {
  const safeType = normalizeString(body.type) ?? "passive";
  const fallbackName = normalizeString(body.signal) ?? "unknown";
  const safeName = normalizeString(body.name) ?? fallbackName;

  const interactionId =
    normalizeString(body.interaction_id) ?? normalizeString((body as any).interactionId);
  const responseId = normalizeString(body.response_id) ?? normalizeString((body as any).responseId);
  const userId = normalizeString(body.user_id) ?? normalizeString((body as any).userId);
  const guestId =
    headers.guestId ?? normalizeString(body.guest_id) ?? normalizeString((body as any).guestId);
  const ts = normalizeString(body.ts) ?? new Date().toISOString();
  const meta = sanitizeMeta(body.meta);

  const normalized: NormalizedSignal = {
    type: safeType,
    name: safeName,
    ts,
  };

  if (interactionId) normalized.interaction_id = interactionId;
  if (responseId) normalized.response_id = responseId;
  if (userId) normalized.user_id = userId;
  if (guestId) normalized.guest_id = guestId;
  if (meta) normalized.meta = meta;

  if (headers.sessionId) {
    normalized.meta = {
      ...(normalized.meta ?? {}),
      session_id_header: headers.sessionId,
    };
  }

  if (headers.guestId && (!normalized.meta || !("guest_id_header" in normalized.meta))) {
    normalized.meta = {
      ...(normalized.meta ?? {}),
      guest_id_header: headers.guestId,
    };
  }

  return normalized;
}

export async function registrarSignal(req: Request, res: Response) {
  applyCorsResponseHeaders(req, res);

  const headersGuest = normalizeString(req.get("X-Eco-Guest-Id"));
  const headersSession = normalizeString(req.get("X-Eco-Session-Id"));

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as SignalBody)
      : {};

  const normalized = normalizeBody(body, { guestId: headersGuest, sessionId: headersSession });

  const supabaseMeta = {
    ...(normalized.meta ?? {}),
    type: normalized.type,
    ts: normalized.ts,
    ...(normalized.response_id ? { response_id: normalized.response_id } : {}),
    ...(normalized.user_id ? { user_id: normalized.user_id } : {}),
    ...(normalized.guest_id ? { guest_id: normalized.guest_id } : {}),
  };

  try {
    if (normalized.interaction_id) {
      const analytics = getAnalyticsClient();
      const { error } = await analytics.from("eco_passive_signals").insert([
        {
          interaction_id: normalized.interaction_id,
          signal: normalized.name,
          meta: supabaseMeta,
        },
      ]);

      if (error) {
        throw error;
      }
    } else {
      logger.warn("signal.missing_interaction_id", {
        name: normalized.name,
        type: normalized.type,
      });
    }
  } catch (err) {
    console.error("[signal] fail", { err, body: normalized });
    const errorMessage =
      err instanceof Error
        ? err.message
        : err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message)
        : "unknown_error";
    logger.error("signal.persist_failed", {
      error: errorMessage,
      name: normalized.name,
      type: normalized.type,
    });
  } finally {
    res.status(204).end();
  }
}
