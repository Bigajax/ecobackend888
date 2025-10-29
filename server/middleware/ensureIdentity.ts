import type { NextFunction, Request, Response } from "express";

import { readIdentity } from "../utils/requestIdentity";

export type RequestWithIdentity = Request & {
  guestId?: string;
  ecoSessionId?: string;
  clientMessageId?: string;
};

declare module "express-serve-static-core" {
  interface Request {
    guestId?: string;
    ecoSessionId?: string;
    clientMessageId?: string;
  }
}

export function ensureIdentity(req: Request, res: Response, next: NextFunction) {
  const { guestId, sessionId, clientMessageId } = readIdentity(req);

  if (!guestId) {
    return res
      .status(400)
      .json({ error: "missing_guest_id", message: "Informe X-Eco-Guest-Id" });
  }

  if (!sessionId) {
    return res
      .status(400)
      .json({ error: "missing_session_id", message: "Informe X-Eco-Session-Id" });
  }

  const requestWithIdentity = req as RequestWithIdentity;
  requestWithIdentity.guestId = guestId;
  requestWithIdentity.ecoSessionId = sessionId;
  if (clientMessageId) {
    requestWithIdentity.clientMessageId = clientMessageId;
  }

  const headerBag = req.headers as Record<string, string>;
  headerBag["x-eco-guest-id"] = guestId;
  headerBag["x-eco-session-id"] = sessionId;
  if (clientMessageId) {
    headerBag["x-eco-client-message-id"] = clientMessageId;
  }

  res.setHeader("X-Eco-Guest-Id", guestId);
  res.setHeader("X-Eco-Session-Id", sessionId);

  next();
}

