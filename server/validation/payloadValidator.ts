import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "http";

import { log } from "../services/promptContext/logger";
import { normalizeMessages, type NormalizedMessage } from "./messageNormalizer";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidationError = { status: number; message: string };

export type ValidationSuccessData = {
  body: Record<string, any>;
  texto: string;
  usuario_id: string;
  normalized: { messages: NormalizedMessage[]; shape: string };
  payloadShape: string;
  clientMessageId: string | null;
  activeClientMessageId: string;
  headerClientMessageId: string | null;
  sessionIdHeader: string | null;
  sessionMetaObject?: Record<string, unknown>;
};

export type ValidationResult =
  | { valid: true; data: ValidationSuccessData }
  | { valid: false; error: ValidationError };

export function isValidUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_V4_REGEX.test(value);
}

function getHeaderValue(headers: IncomingHttpHeaders, key: string): string | null {
  const rawValue = headers[key.toLowerCase() as keyof IncomingHttpHeaders];
  if (Array.isArray(rawValue)) {
    const lastValue = rawValue[rawValue.length - 1];
    if (typeof lastValue === "string" && lastValue.trim()) {
      return lastValue.trim();
    }
    return null;
  }
  if (typeof rawValue === "string" && rawValue.trim()) {
    return rawValue.trim();
  }
  return null;
}

function extractClientMessageIdFromBody(body: Record<string, any>): string | null {
  const candidate =
    typeof body.clientMessageId === "string"
      ? body.clientMessageId
      : typeof body.client_message_id === "string"
      ? body.client_message_id
      : typeof body.messageId === "string"
      ? body.messageId
      : typeof body.message_id === "string"
      ? body.message_id
      : undefined;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed ? trimmed : null;
}

export function extractClientMessageId(
  body: unknown,
  headers: IncomingHttpHeaders
): string | null {
  const headerCandidate = getHeaderValue(headers, "x-eco-client-message-id");
  if (headerCandidate) {
    return headerCandidate;
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return extractClientMessageIdFromBody(body as Record<string, any>);
  }
  return null;
}

export function validateAskEcoPayload(
  rawBody: unknown,
  headers: IncomingHttpHeaders
): ValidationResult {
  const isJsonObject = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody);
  if (!isJsonObject) {
    log.warn("[ask-eco] payload_invalid", { reason: "body_not_object" });
    return {
      valid: false,
      error: {
        status: 400,
        message: "payload inválido: informe uma mensagem de usuário",
      },
    };
  }

  const body = rawBody as Record<string, any>;

  const normalized = normalizeMessages(body);
  const payloadShape = normalized.shape;

  if (!normalized.messages.length) {
    log.warn("[ask-eco] payload_invalid", { reason: "missing_messages", payloadShape });
    return {
      valid: false,
      error: { status: 400, message: "payload inválido: informe uma mensagem de usuário" },
    };
  }

  const lastUserMessage = [...normalized.messages]
    .reverse()
    .find(
      (msg) =>
        msg.role === "user" &&
        typeof msg.content === "string" &&
        msg.content.trim().length > 0
    );

  if (!lastUserMessage) {
    log.warn("[ask-eco] payload_invalid", { reason: "missing_user_message", payloadShape });
    return {
      valid: false,
      error: { status: 400, message: "payload inválido: informe uma mensagem de usuário" },
    };
  }

  const textoRaw = lastUserMessage.content.trim();
  body.texto = textoRaw;

  const rawUsuarioId = (() => {
    const fromBody =
      typeof body.usuario_id === "string"
        ? body.usuario_id
        : typeof body.usuarioId === "string"
        ? body.usuarioId
        : typeof body.user_id === "string"
        ? body.user_id
        : typeof body.userId === "string"
        ? body.userId
        : undefined;
    if (typeof fromBody === "string" && fromBody.trim()) {
      return fromBody.trim();
    }
    const fromHeader = getHeaderValue(headers, "x-eco-user-id");
    if (fromHeader) {
      return fromHeader;
    }
    return null;
  })();

  const usuarioIdCandidate = rawUsuarioId && rawUsuarioId.trim().length ? rawUsuarioId.trim() : null;
  const usuarioIdRaw = usuarioIdCandidate && isValidUuid(usuarioIdCandidate)
    ? usuarioIdCandidate
    : randomUUID();
  body.usuario_id = usuarioIdRaw;

  const contextoValue = body.contexto;
  const contextoValid =
    contextoValue === undefined ||
    contextoValue === null ||
    (typeof contextoValue === "object" && !Array.isArray(contextoValue));

  if (!contextoValid) {
    log.warn("[ask-eco] payload_invalid", {
      reason: "invalid_contexto",
      contextoType: Array.isArray(contextoValue)
        ? "array"
        : contextoValue === null
        ? "null"
        : typeof contextoValue,
    });
    return {
      valid: false,
      error: { status: 400, message: "payload inválido: contexto deve ser objeto" },
    };
  }

  const rawClientMessageId = extractClientMessageIdFromBody(body);

  if (rawClientMessageId && normalized.messages.length) {
    const lastIndex = normalized.messages.length - 1;
    const lastMessage = normalized.messages[lastIndex];
    lastMessage.id = rawClientMessageId;
  }

  const lastMessageWithId = [...normalized.messages]
    .slice()
    .reverse()
    .find((msg) => typeof msg.id === "string");

  let lastMessageId: string | null = null;
  if (lastMessageWithId && typeof lastMessageWithId.id === "string") {
    const trimmed = lastMessageWithId.id.trim();
    if (trimmed) {
      lastMessageWithId.id = trimmed;
      lastMessageId = trimmed;
    } else {
      (lastMessageWithId as { id?: string }).id = undefined;
    }
  }

  const clientMessageId = rawClientMessageId ?? lastMessageId;
  const headerClientMessageId = getHeaderValue(headers, "x-eco-client-message-id");
  const activeClientMessageId =
    extractClientMessageId(body, headers) ??
    (typeof clientMessageId === "string" && clientMessageId.trim() ? clientMessageId.trim() : null);

  if (!activeClientMessageId) {
    log.warn("[ask-eco] missing_client_message_id");
    return {
      valid: false,
      error: { status: 400, message: "missing clientMessageId" },
    };
  }

  const sessionMeta = body.sessionMeta;
  const sessionMetaObject =
    sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta)
      ? (sessionMeta as Record<string, unknown>)
      : undefined;

  const sessionIdHeader = getHeaderValue(headers, "x-eco-session-id");

  return {
    valid: true,
    data: {
      body,
      texto: textoRaw,
      usuario_id: usuarioIdRaw,
      normalized,
      payloadShape,
      clientMessageId: clientMessageId ?? null,
      activeClientMessageId,
      headerClientMessageId,
      sessionIdHeader,
      sessionMetaObject,
    },
  };
}
