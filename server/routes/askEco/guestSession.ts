import crypto from "node:crypto";

import type { ActivationTracer } from "../../core/activationTracer";
import { guestSessionConfig, incrementGuestInteraction } from "../../core/http/middlewares/guestSession";

import type { GuestAwareRequest } from "./requestParsing";
import { AskEcoRequestError } from "./errors";

export type GuestIdentity = {
  isGuest: boolean;
  guestId: string | null;
  hasBearer: boolean;
  token?: string;
};

export const resolveGuestIdentity = (req: GuestAwareRequest): GuestIdentity => {
  const headerGuestId =
    (req.headers["x-eco-guest-id"] as string | undefined)?.trim() ||
    (req.headers["X-Eco-Guest-Id"] as string | undefined)?.trim() ||
    (req.headers["x-guest-id"] as string | undefined)?.trim() ||
    (req.headers["X-Guest-Id"] as string | undefined)?.trim();

  const bodyIsGuest = Boolean(req.body?.isGuest);
  const bodyGuestId = typeof req.body?.guestId === "string" ? req.body.guestId.trim() : "";

  const authHeader = req.headers.authorization;
  const hasBearer = typeof authHeader === "string" && /^Bearer\s+/i.test(authHeader?.trim() || "");
  const token = hasBearer ? authHeader.trim().replace(/^Bearer\s+/i, "") : undefined;

  let isGuest = false;
  let guestId: string | null = null;

  if (hasBearer && token) {
    isGuest = false;
  } else if (req.guest?.id || headerGuestId || bodyIsGuest || bodyGuestId) {
    isGuest = true;
    guestId = (req.guest?.id || headerGuestId || bodyGuestId || "").trim() || null;
  } else {
    isGuest = true;
    guestId = `guest_${crypto.randomUUID()}`;
  }

  return { isGuest, guestId, hasBearer, token };
};

export const ensureAuthenticatedUserRequest = (
  identity: GuestIdentity,
  usuarioIdBody: string | undefined
) => {
  if (identity.isGuest) return;
  if (!identity.hasBearer || !identity.token) {
    throw new AskEcoRequestError("Token de acesso ausente.", 401);
  }
  if (!usuarioIdBody) {
    throw new AskEcoRequestError("usuario_id e messages são obrigatórios.", 400);
  }
};

export const enforceGuestRateLimit = (
  req: GuestAwareRequest,
  guestId: string,
  activationTracer: ActivationTracer
): number => {
  const count = incrementGuestInteraction(guestId);
  if (count > guestSessionConfig.maxInteractions) {
    activationTracer.addError("rate_limit", "Limite de interações do modo convidado atingido.");
    throw new AskEcoRequestError("Limite de interações do modo convidado atingido.", 429);
  }
  if (req.guest) {
    req.guest.interactionsUsed = count;
  }
  return count;
};

export const attachGuestToSessionMeta = (
  sessionMeta: Record<string, any> | undefined,
  guestId: string | null
): { sessionMeta?: Record<string, any>; distinctId?: string } => {
  if (!guestId) {
    return { sessionMeta, distinctId: sessionMeta?.distinctId };
  }

  const resultSessionMeta = sessionMeta ? { ...sessionMeta } : { distinctId: guestId };
  if (!resultSessionMeta.distinctId) {
    resultSessionMeta.distinctId = guestId;
  }

  return { sessionMeta: resultSessionMeta, distinctId: resultSessionMeta.distinctId };
};
