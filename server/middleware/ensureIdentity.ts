import type { NextFunction, Request, Response } from "express";

import { readIdentity } from "../utils/requestIdentity";
import { log } from "../services/promptContext/logger";

export type RequestWithIdentity = Request & {
  guestId?: string;
  sessionId?: string;
  ecoSessionId?: string;
  clientMessageId?: string;
};

declare module "express-serve-static-core" {
  interface Request {
    guestId?: string;
    sessionId?: string;
    ecoSessionId?: string;
    clientMessageId?: string;
  }
}

export function ensureIdentity(req: Request, res: Response, next: NextFunction) {
  const { guestId, sessionId, clientMessageId } = readIdentity(req);

  if (!sessionId) {
    return res
      .status(400)
      .json({ error: "missing_session_id", message: "Informe X-Eco-Session-Id" });
  }

  const requestWithIdentity = req as RequestWithIdentity;
  const resolvedGuestId = requestWithIdentity.guestId ?? guestId;

  if (!resolvedGuestId) {
    log.error("[ensureIdentity] guest id missing after middleware", { path: req.path });
    return res.status(500).json({ error: "guest_identity_unavailable" });
  }

  requestWithIdentity.guestId = resolvedGuestId;
  requestWithIdentity.sessionId = sessionId;
  requestWithIdentity.ecoSessionId = sessionId;
  if (clientMessageId) {
    requestWithIdentity.clientMessageId = clientMessageId;
  }

  const headerBag = req.headers as Record<string, string>;
  headerBag["x-eco-guest-id"] = resolvedGuestId;
  headerBag["x-eco-session-id"] = sessionId;
  if (clientMessageId) {
    headerBag["x-eco-client-message-id"] = clientMessageId;
  }

  res.setHeader("X-Eco-Guest-Id", resolvedGuestId);
  res.setHeader("X-Eco-Session-Id", sessionId);

  next();
}

