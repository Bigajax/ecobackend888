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
  const identity = readIdentity(req);
  const { guestId, sessionId, clientMessageId, meta } = identity;
  const { guest, session, client } = meta;
  const identitySources = req.ecoIdentitySources;

  const method = req.method.toUpperCase();
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : null;
  const isAskEco = req.path.startsWith("/api/ask-eco");
  const isAskEcoPost = isAskEco && method === "POST";
  const isAuthenticated = Boolean((req as any).user?.id);

  const guestSourceLogged = guest.source ?? identitySources?.guest ?? null;
  const sessionSourceLogged = session.source ?? identitySources?.session ?? null;
  const guestHeaderProvided = identitySources?.guestHeaderProvided ?? false;
  const sessionHeaderProvided = identitySources?.sessionHeaderProvided ?? false;
  const guestSuppliedByClient =
    guest.source === "body" ||
    guest.source === "query" ||
    (guest.source === "header" && guestHeaderProvided);
  const sessionSuppliedByClient =
    session.source === "body" ||
    session.source === "query" ||
    (session.source === "header" && sessionHeaderProvided);

  if (req.path === "/health") {
    return next();
  }

  if (isAskEco && (method === "POST" || method === "GET")) {
    log.debug("[ask-eco] identity_source", {
      path: req.path,
      method,
      origin: origin ?? null,
      guestSource: guest.source ?? null,
      guestIdSource: guestSourceLogged,
      guestIdValid: guest.valid,
      guestHeaderProvided,
      guestHeaderValid: identitySources?.guestHeaderValid ?? false,
      sessionSource: session.source ?? null,
      sessionIdSource: sessionSourceLogged,
      sessionIdValid: session.valid,
      sessionHeaderProvided,
      sessionHeaderValid: identitySources?.sessionHeaderValid ?? false,
      clientMessageIdSource: client.source ?? null,
      clientMessageIdValid: client.valid,
    });
  }

  if (isAskEcoPost && !isAuthenticated) {
    if (!guestSuppliedByClient) {
      log.warn("[ensureIdentity] missing_guest_id", {
        path: req.path,
        method,
        origin: origin ?? null,
        source: guest.source ?? null,
      });
      return res
        .status(400)
        .json({ error: "missing_guest_id", message: "Informe guest_id no header (X-Eco-Guest-Id) ou no corpo da requisição" });
    }
    if (!guest.valid) {
      log.warn("[ensureIdentity] invalid_guest_id", {
        path: req.path,
        method,
        origin: origin ?? null,
        value: guest.candidate || null,
        source: guest.source ?? null,
      });
      return res
        .status(400)
        .json({ error: "invalid_guest_id", message: "Envie um UUID v4 em X-Eco-Guest-Id" });
    }
    if (!sessionSuppliedByClient) {
      log.warn("[ensureIdentity] missing_session_id", {
        path: req.path,
        method,
        origin: origin ?? null,
        source: session.source ?? null,
      });
      return res.status(400).json({ error: "missing_session_id", message: "Informe X-Eco-Session-Id" });
    }
    if (!session.valid) {
      log.warn("[ensureIdentity] invalid_session_id", {
        path: req.path,
        method,
        origin: origin ?? null,
        value: session.candidate || null,
        source: session.source ?? null,
      });
      return res.status(400).json({ error: "invalid_session_id", message: "Envie um UUID v4 em X-Eco-Session-Id" });
    }
  }

  if (!sessionId) {
    log.warn("[ensureIdentity] missing_session_id", {
      path: req.path,
      method,
      origin: origin ?? null,
      source: session.source ?? null,
      candidate: session.candidate || null,
    });
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
  if (clientMessageId) {
    res.setHeader("X-Eco-Client-Message-Id", clientMessageId);
  }

  const locals = res.locals as Record<string, unknown>;
  locals.ecoIdentitySource = {
    guest: guest.source ?? null,
    session: session.source ?? null,
    clientMessageId: client.source ?? null,
  };

  next();
}

