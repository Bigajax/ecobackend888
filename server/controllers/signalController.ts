import type { Request, Response } from "express";
import { getAnalyticsClient } from "../services/supabaseClient";
import { log } from "../services/promptContext/logger";
import { applyCorsResponseHeaders } from "../middleware/cors";
import { normalizeGuestIdentifier } from "../core/http/guestIdentity";
import {
  getInteractionGuest,
  updateInteractionGuest,
} from "../services/conversation/interactionIdentityStore";

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

function normalizeGuestIdValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return normalizeGuestIdentifier(value);
}

function normalizeBody(body: SignalBody, headers: { guestId?: string; sessionId?: string }): NormalizedSignal {
  const safeType = normalizeString(body.type) ?? "passive";
  const fallbackName = normalizeString(body.signal) ?? "unknown";
  const safeName = normalizeString(body.name) ?? fallbackName;

  const interactionId =
    normalizeString(body.interaction_id) ?? normalizeString((body as any).interactionId);
  const responseId = normalizeString(body.response_id) ?? normalizeString((body as any).responseId);
  const userId = normalizeString(body.user_id) ?? normalizeString((body as any).userId);
  const headerGuestId = normalizeGuestIdValue(headers.guestId);
  const guestIdCandidate =
    normalizeGuestIdValue(normalizeString(body.guest_id)) ??
    normalizeGuestIdValue(normalizeString((body as any).guestId));
  const guestId = headerGuestId ?? guestIdCandidate;
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

  if (headerGuestId && (!normalized.meta || !("guest_id_header" in normalized.meta))) {
    normalized.meta = {
      ...(normalized.meta ?? {}),
      guest_id_header: headerGuestId,
    };
  }

  return normalized;
}

export async function registrarSignal(req: Request, res: Response) {
  applyCorsResponseHeaders(req, res);

  const headerGuestRaw = req.get("X-Eco-Guest-Id");
  const headersGuest = normalizeGuestIdValue(headerGuestRaw);
  if (!headersGuest || headersGuest.length < 8) {
    logger.warn("signal.missing_guest_header", {
      provided: typeof headerGuestRaw === "string" ? headerGuestRaw : null,
    });
    return res
      .status(400)
      .json({
        error: "invalid_guest_id",
        message: "X-Eco-Guest-Id deve ter no mínimo 8 caracteres",
      });
  }

  const headersSession = normalizeString(req.get("X-Eco-Session-Id"));

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as SignalBody)
      : {};

  const headerInteractionId = normalizeString(req.get("X-Eco-Interaction-Id"));
  const bodyInteractionId =
    normalizeString(body.interaction_id) ?? normalizeString((body as any).interactionId);

  if (!headerInteractionId && !bodyInteractionId) {
    logger.warn("signal.missing_interaction_id", {});
    return res.status(400).json({ error: "missing_interaction_id" });
  }

  const interactionId = headerInteractionId ?? bodyInteractionId;
  if (!interactionId) {
    logger.warn("signal.interaction_unresolved", {
      header: headerInteractionId ?? null,
      body: bodyInteractionId ?? null,
    });
    return res.status(400).json({ error: "missing_interaction_id" });
  }

  if (headerInteractionId && bodyInteractionId && headerInteractionId !== bodyInteractionId) {
    logger.warn("signal.interaction_header_body_mismatch", {
      header_interaction_id: headerInteractionId,
      body_interaction_id: bodyInteractionId,
    });
  }

  logger.info("signal.interaction_resolved", { interaction_id: interactionId });

  const normalized = normalizeBody(body, { guestId: headersGuest, sessionId: headersSession });
  normalized.interaction_id = interactionId;

  const registeredGuest = getInteractionGuest(interactionId);
  logger.info("signal.guest_received", {
    interaction_id: interactionId,
    guest_id: headersGuest,
    registered_guest_id: registeredGuest ?? null,
  });

  if (registeredGuest === undefined) {
    return res.status(404).json({ error: "interaction_not_found" });
  }

  if (registeredGuest && registeredGuest !== headersGuest) {
    logger.warn("signal.guest_mismatch", {
      interaction_id: interactionId,
      expected: registeredGuest,
      received: headersGuest,
    });
    return res.status(409).json({ error: "guest_mismatch" });
  }

  updateInteractionGuest(interactionId, registeredGuest ?? headersGuest);

  let analyticsClient;
  try {
    analyticsClient = getAnalyticsClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("signal.analytics_unavailable", { message });
    return res.status(503).json({ error: "analytics_unavailable" });
  }

  try {
    const { data, error } = await analyticsClient
      .from("eco_interactions")
      .select("id")
      .eq("id", normalized.interaction_id)
      .maybeSingle();

    if (error) {
      logger.error("signal.interaction_lookup_failed", {
        interaction_id: normalized.interaction_id,
        message: error.message,
        code: error.code ?? null,
      });
      return res.status(500).json({ error: "interaction_lookup_failed" });
    }

    if (!data || typeof data.id !== "string") {
      logger.warn("signal.interaction_not_found", {
        interaction_id: normalized.interaction_id,
      });
      return res.status(404).json({ error: "interaction_not_found" });
    }
  } catch (error) {
    logger.error("signal.interaction_lookup_unexpected", {
      interaction_id: normalized.interaction_id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "interaction_lookup_unexpected" });
  }

  const supabaseMeta = {
    ...(normalized.meta ?? {}),
    type: normalized.type,
    ts: normalized.ts,
    ...(normalized.response_id ? { response_id: normalized.response_id } : {}),
    ...(normalized.user_id ? { user_id: normalized.user_id } : {}),
    ...(normalized.guest_id ? { guest_id: normalized.guest_id } : {}),
  };

  try {
    const { error } = await analyticsClient.from("eco_passive_signals").insert([
      {
        interaction_id: normalized.interaction_id,
        signal: normalized.name,
        meta: supabaseMeta,
      },
    ]);

    if (error) {
      throw error;
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message)
        : "unknown_error";
    logger.error("signal.persist_failed", {
      message: errorMessage,
      name: normalized.name,
      type: normalized.type,
      interaction_id: normalized.interaction_id,
    });
    return res.status(500).json({ error: "signal_persist_failed" });
  }

  return res.status(204).end();
}
