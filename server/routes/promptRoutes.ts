// server/routes/promptRoutes.ts
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import { STREAM_TIMEOUT_MESSAGE } from "./askEco/streaming";
import { log } from "../services/promptContext/logger";
import type { EcoStreamHandler, EcoStreamEvent } from "../services/conversation/types";
import { createHttpError, isHttpError } from "../utils/http";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { createSSE, prepareSseHeaders } from "../utils/sse";
import { applyCorsResponseHeaders, isAllowedOrigin } from "../middleware/cors";
import { normalizeGuestIdentifier } from "../core/http/guestIdentity";
import { createInteraction } from "../services/conversation/interactionAnalytics";

/** Sanitiza a saída removendo blocos ```json``` e JSON final pendurado */
function sanitizeOutput(input?: string): string {
  const txt = input ?? "";
  return txt
    // remove blocos ```json ... ```
    .replace(/```(?:json)?[\s\S]*?```/gi, "")
    // remove possível payload JSON final
    .replace(/\{[\s\S]*?\}\s*$/g, "")
    .trim();
}

type DonePayload = {
  content: string | null;
  interaction_id: string | null;
  tokens: { in: number | null; out: number | null };
  meta: Record<string, unknown> | null;
  timings: Record<string, unknown> | null;
  at: string;
  sinceStartMs: number;
};

function buildDonePayload(options: {
  content?: string | null;
  interactionId?: string | null;
  tokens?: { in?: number | null; out?: number | null } | null;
  meta?: Record<string, unknown> | null | undefined;
  timings?: Record<string, unknown> | null | undefined;
  firstTokenLatency?: number | null;
  totalLatency?: number | null;
  timestamp?: number;
}): DonePayload {
  const {
    content = null,
    interactionId = null,
    tokens,
    meta,
    timings,
    firstTokenLatency,
    totalLatency,
    timestamp,
  } = options;

  const resolvedTokens = {
    in: tokens?.in ?? null,
    out: tokens?.out ?? null,
  };

  const payloadTimings: Record<string, unknown> = {
    ...(timings ?? {}),
  };

  if (firstTokenLatency != null) {
    payloadTimings.firstTokenLatencyMs = firstTokenLatency;
  }
  if (totalLatency != null) {
    payloadTimings.totalLatencyMs = totalLatency;
  }

  const now = typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : Date.now();

  return {
    content,
    interaction_id: interactionId ?? null,
    tokens: resolvedTokens,
    meta: meta ? { ...meta } : null,
    timings: Object.keys(payloadTimings).length ? payloadTimings : null,
    at: new Date(now).toISOString(),
    sinceStartMs: totalLatency ?? 0,
  };
}

const router = Router();
const askEcoRouter = Router();

const activeStreamSessions = new Map<
  string,
  { controller: AbortController; interactionId: string }
>();

type ActiveInteractionState = {
  controller: AbortController;
  startedAt: number;
};

const ACTIVE_INTERACTION_TTL_MS = parseDurationEnv(
  process.env.ECO_ACTIVE_INTERACTION_TTL_MS,
  10 * 60 * 1000
);

const activeInteractions = new Map<string, ActiveInteractionState>();

function pruneActiveInteractions(now: number = Date.now()): void {
  for (const [key, entry] of activeInteractions.entries()) {
    const isExpired = entry.startedAt + ACTIVE_INTERACTION_TTL_MS <= now;
    if (isExpired || entry.controller.signal.aborted) {
      activeInteractions.delete(key);
    }
  }
}

function reserveActiveInteraction(
  key: string,
  controller: AbortController
): boolean {
  const normalized = key.trim();
  if (!normalized) {
    return true;
  }
  pruneActiveInteractions();
  const existing = activeInteractions.get(normalized);
  if (existing) {
    if (existing.controller === controller) {
      return true;
    }
    if (existing.controller.signal.aborted) {
      activeInteractions.delete(normalized);
    } else {
      return false;
    }
  }
  activeInteractions.set(normalized, {
    controller,
    startedAt: Date.now(),
  });
  return true;
}

function releaseActiveInteraction(
  key: string,
  controller: AbortController
): void {
  const normalized = key.trim();
  if (!normalized) {
    return;
  }
  const existing = activeInteractions.get(normalized);
  if (!existing) {
    return;
  }
  if (existing.controller === controller) {
    activeInteractions.delete(normalized);
  }
}

function buildActiveInteractionKey(type: "client" | "interaction", value: string): string {
  return `${type}:${value.trim()}`;
}

type ClientMessageState = {
  status: "active" | "completed";
  expiresAt: number;
};

function parseDurationEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const CLIENT_MESSAGE_ACTIVE_TTL_MS = parseDurationEnv(
  process.env.ECO_CLIENT_MESSAGE_ACTIVE_TTL_MS,
  5 * 60 * 1000
);
const CLIENT_MESSAGE_COMPLETED_TTL_MS = parseDurationEnv(
  process.env.ECO_CLIENT_MESSAGE_COMPLETED_TTL_MS,
  60 * 60 * 1000
);

const clientMessageRegistry = new Map<string, ClientMessageState>();

function pruneClientMessageRegistry(now: number = Date.now()): void {
  for (const [key, entry] of clientMessageRegistry.entries()) {
    if (entry.expiresAt <= now) {
      clientMessageRegistry.delete(key);
    }
  }
}

function reserveClientMessage(
  key: string
): { ok: true } | { ok: false; status: "active" | "completed" } {
  const now = Date.now();
  pruneClientMessageRegistry(now);
  const existing = clientMessageRegistry.get(key);
  if (existing && existing.expiresAt > now) {
    return { ok: false, status: existing.status };
  }
  clientMessageRegistry.set(key, {
    status: "active",
    expiresAt: now + CLIENT_MESSAGE_ACTIVE_TTL_MS,
  });
  return { ok: true };
}

function markClientMessageCompleted(key: string): void {
  const now = Date.now();
  clientMessageRegistry.set(key, {
    status: "completed",
    expiresAt: now + CLIENT_MESSAGE_COMPLETED_TTL_MS,
  });
}

function releaseClientMessage(key: string): void {
  clientMessageRegistry.delete(key);
}

function buildClientMessageKey(identity: string | null, messageId: string): string {
  const normalizedIdentity = identity && identity.trim() ? identity.trim() : null;
  const normalizedMessageId = messageId.trim();
  return normalizedIdentity ? `${normalizedIdentity}:${normalizedMessageId}` : normalizedMessageId;
}

export { askEcoRouter as askEcoRoutes };

const REQUIRE_GUEST_ID =
  String(process.env.ECO_REQUIRE_GUEST_ID ?? "false").toLowerCase() === "true";

const DEFAULT_STREAM_TIMEOUT_MS = 45_000;
const streamTimeoutMs = (() => {
  const raw = process.env.ECO_SSE_TIMEOUT_MS;
  if (!raw) return DEFAULT_STREAM_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_STREAM_TIMEOUT_MS;
  }
  return parsed;
})();

type RequestWithIdentity = Request & {
  guestId?: string | null;
  user?: { id?: string | null } | null;
};

function disableCompressionForSse(response: Response) {
  if (typeof (response as any).removeHeader === "function") {
    (response as any).removeHeader("Content-Encoding");
    (response as any).removeHeader("Content-Length");
  } else {
    response.setHeader("Content-Encoding", "");
    response.removeHeader("Content-Encoding");
    response.removeHeader("Content-Length");
  }
  response.setHeader("X-No-Compression", "1");
}

function ensureVaryIncludes(response: Response, value: string) {
  const existing = response.getHeader("Vary");
  if (!existing) {
    response.setHeader("Vary", value);
    return;
  }

  const normalized = (Array.isArray(existing) ? existing : [existing])
    .flatMap((entry) =>
      String(entry)
        .split(",")
        .map((piece) => piece.trim())
        .filter(Boolean)
    )
    .filter(Boolean);

  if (!normalized.includes(value)) {
    normalized.push(value);
    response.setHeader("Vary", normalized.join(", "));
  }
}

function extractSessionIdLoose(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const candidates = [
    source.sessionId,
    source.session_id,
    source.sessionID,
    source.sessaoId,
    source.sessao_id,
    source.sessaoID,
    source.session,
    source.sessao,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

/** GET /api/prompt-preview */
router.get("/prompt-preview", async (req: Request, res: Response) => {
  try {
    await getPromptEcoPreview(req, res);
  } catch (error) {
    console.error("Erro no handler de rota /prompt-preview:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro interno ao montar o prompt." });
    }
  }
});

/** Extrai texto de payloads em formatos variados (defensivo) */
function extractTextLoose(payload: any): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === "string" && payload.trim()) return payload.trim();

  const tryList = (val: any): string | undefined => {
    if (!val) return undefined;
    if (typeof val === "string" && val.trim()) return val.trim();

    if (Array.isArray(val)) {
      for (const v of val) {
        const t = tryList(v);
        if (t) return t;
      }
    } else if (typeof val === "object") {
      const keysTextFirst = [
        "text",
        "content",
        "texto",
        "output_text",
        "outputText",
        "output",
        "answer",
        "reply",
        "resposta",
        "respostaFinal",
        "fala",
        "speech",
        "message",
        "delta",
      ];
      for (const k of keysTextFirst) {
        const t = tryList((val as any)[k]);
        if (t) return t;
      }

      const paths = [
        ["response", "text"],
        ["response", "content"],
        ["response", "message"],
        ["result", "text"],
        ["result", "content"],
        ["result", "message"],
        ["payload", "text"],
        ["payload", "content"],
        ["payload", "message"],
      ] as const;
      for (const p of paths) {
        const t = tryList((val as any)[p[0]]?.[p[1]]);
        if (t) return t;
      }

      if (Array.isArray((val as any).choices)) {
        for (const c of (val as any).choices) {
          const t =
            tryList((c as any).delta) ||
            tryList((c as any).message) ||
            tryList((c as any).text) ||
            tryList((c as any).content);
          if (t) return t;
        }
      }
    }
    return undefined;
  };

  return tryList(payload);
}

/**
 * Extrai texto de eventos vindos do orquestrador de streaming.
 * Os adaptadores nem sempre usam a mesma chave, então varremos uma lista ampla
 * de campos conhecidos, caindo em `extractTextLoose` para objetos aninhados.
 */
function extractEventText(event: unknown): string | undefined {
  if (!event) return undefined;

  const candidates: unknown[] = [];

  if (typeof event === "string") {
    candidates.push(event);
  } else if (typeof event === "object") {
    const obj = event as Record<string, unknown>;
    const delta = obj.delta;
    if (delta !== undefined) {
      candidates.push(delta);
      if (typeof delta === "object" && delta !== null) {
        const deltaObj = delta as Record<string, unknown>;
        candidates.push(deltaObj.content, deltaObj.text, deltaObj.value);
        if (Array.isArray(deltaObj.content)) {
          candidates.push(deltaObj.content.join(""));
        }
      }
    }
    candidates.push(
      obj.content,
      obj.text,
      obj.message,
      obj.output,
      obj.output_text,
      obj.response,
      obj.value
    );
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    const extracted = extractTextLoose(candidate);
    if (extracted) {
      return extracted;
    }
  }

  return typeof event === "string" ? event : extractTextLoose(event);
}

function getGuestIdFromCookies(req: Request): string | undefined {
  const cookieGuestId = (req as any)?.cookies?.guest_id;
  if (typeof cookieGuestId === "string" && cookieGuestId.trim()) {
    return cookieGuestId.trim();
  }

  const rawCookie = req.headers.cookie;
  if (!rawCookie) return undefined;

  for (const piece of rawCookie.split(";")) {
    const [key, ...rest] = piece.split("=");
    if (!key) continue;
    if (key.trim() === "guest_id") {
      try {
        const value = rest.join("=");
        const decoded = decodeURIComponent(value ?? "");
        if (decoded.trim()) {
          return decoded.trim();
        }
      } catch {
        /* ignore decode errors */
      }
    }
  }

  return undefined;
}

type NormalizedMessage = { id?: string; role: string; content: string };

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeMessages(payload: unknown): { messages: NormalizedMessage[]; shape: string } {
  const body = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const result: NormalizedMessage[] = [];
  let shape: "text" | "mensagem" | "mensagens" | "invalid" = "invalid";

  const sourceArray: unknown = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.mensagens)
    ? body.mensagens
    : undefined;

  if (Array.isArray(sourceArray)) {
    shape = "mensagens";
    for (const raw of sourceArray) {
      if (!raw || typeof raw !== "object") continue;
      const roleValue = (raw as any).role;
      const contentValue =
        (raw as any).content ??
        (raw as any).text ??
        (raw as any).mensagem ??
        (raw as any).message ??
        (raw as any).delta ??
        (raw as any).value;
      const role = typeof roleValue === "string" && roleValue.trim() ? roleValue.trim() : "user";
      let content: string = "";
      if (typeof contentValue === "string") {
        content = contentValue;
      } else if (contentValue != null) {
        try {
          content = JSON.stringify(contentValue);
        } catch {
          content = String(contentValue);
        }
      }
      const normalized: NormalizedMessage = { role, content };
      if (typeof (raw as any).id === "string") {
        normalized.id = (raw as any).id;
      }
      result.push(normalized);
    }
    return { messages: result, shape };
  }

  const singleText = typeof body.text === "string" && body.text.trim();
  if (singleText) {
    shape = "text";
    result.push({ role: "user", content: body.text });
    return { messages: result, shape };
  }

  const singleMensagem = typeof body.mensagem === "string" && body.mensagem.trim();
  if (singleMensagem) {
    shape = "mensagem";
    result.push({ role: "user", content: body.mensagem });
    return { messages: result, shape };
  }

  return { messages: result, shape };
}

function resolveGuestId(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = normalizeGuestIdentifier(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

askEcoRouter.head("/", (req: Request, res: Response) => {
  applyCorsResponseHeaders(req, res);
  res.status(200).end();
});

/** POST /api/ask-eco — stream SSE (ou JSON se cliente não pedir SSE) */
askEcoRouter.post("/", async (req: Request, res: Response, _next: NextFunction) => {
  applyCorsResponseHeaders(req, res);
  const reqWithIdentity = req as RequestWithIdentity;
  const accept = String(req.headers.accept || "").toLowerCase();
  const streamParam = (() => {
    const fromQuery = (req.query as any)?.stream;
    if (typeof fromQuery === "string") return fromQuery;
    if (Array.isArray(fromQuery)) return fromQuery[fromQuery.length - 1];
    const bodyValue = (req.body as any)?.stream;
    if (typeof bodyValue === "string") return bodyValue;
    if (typeof bodyValue === "boolean") return bodyValue ? "true" : "false";
    return undefined;
  })();
  const wantsStreamByFlag = typeof streamParam === "string" && /^(1|true|yes)$/i.test(streamParam.trim());
  const wantsStream = wantsStreamByFlag || accept.includes("text/event-stream");
  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const allowedOrigin = isAllowedOrigin(originHeader);
  const origin = originHeader || undefined;
  const streamIdHeader = req.headers["x-stream-id"];
  const streamId = typeof streamIdHeader === "string" ? streamIdHeader : undefined;

  if (wantsStream && !allowedOrigin) {
    log.warn("[ask-eco] origin_blocked", { origin: origin ?? null });
    return res.status(403).end();
  }

  const rawBody = req.body;
  const isJsonObject = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody);
  if (!isJsonObject) {
    log.warn("[ask-eco] payload_invalid", { reason: "body_not_object" });
    return res
      .status(400)
      .json({ ok: false, error: "payload inválido: texto, usuario_id obrigatórios" });
  }

  const body = rawBody as Record<string, any>;
  const textoRaw = typeof body.texto === "string" ? body.texto.trim() : "";
  const usuarioIdRaw = typeof body.usuario_id === "string" ? body.usuario_id.trim() : "";
  const contextoValue = body.contexto;
  const contextoValid =
    contextoValue === undefined ||
    contextoValue === null ||
    (typeof contextoValue === "object" && !Array.isArray(contextoValue));

  if (!textoRaw || !usuarioIdRaw || !UUID_V4_REGEX.test(usuarioIdRaw) || !contextoValid) {
    log.warn("[ask-eco] payload_invalid", {
      reason: "missing_required_fields",
      hasTexto: Boolean(textoRaw),
      hasUsuarioId: Boolean(usuarioIdRaw),
      contextoType: Array.isArray(contextoValue)
        ? "array"
        : contextoValue === null
        ? "null"
        : typeof contextoValue,
    });
    return res
      .status(400)
      .json({ ok: false, error: "payload inválido: texto, usuario_id obrigatórios" });
  }

  body.texto = textoRaw;
  body.usuario_id = usuarioIdRaw;

  const locals = (res.locals ?? {}) as Record<string, unknown>;
  locals.corsAllowed = allowedOrigin;
  locals.corsOrigin = origin ?? null;

  applyCorsResponseHeaders(req, res);

  (res.locals as Record<string, unknown>).isSse = wantsStream;

  const guestIdFromSession: string | undefined = (req as any)?.guest?.id || undefined;
  const guestIdFromRequest =
    typeof reqWithIdentity.guestId === "string" ? reqWithIdentity.guestId : undefined;
  const guestIdFromHeader = req.get("X-Eco-Guest-Id")?.trim();
  const guestIdFromCookie = getGuestIdFromCookies(req);

  const {
    nome_usuario,
    usuario_id,
    clientHour,
    isGuest,
    guestId,
    sessionMeta,
  } = body;

  const isGuestRequest = Boolean(isGuest);

  const sessionMetaObject =
    sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta)
      ? (sessionMeta as Record<string, unknown>)
      : undefined;

  const sessionIdHeaderRaw = req.get("X-Eco-Session-Id");
  const sessionIdHeader =
    typeof sessionIdHeaderRaw === "string" && sessionIdHeaderRaw.trim()
      ? sessionIdHeaderRaw.trim()
      : null;

  const normalized = normalizeMessages(body);
  const payloadShape = normalized.shape;

  const rawClientMessageId = (() => {
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
  })();

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

  let clientMessageKey: string | null = null;
  let clientMessageReserved = false;

  const guestIdResolved = resolveGuestId(
    typeof guestId === "string" ? guestId : undefined,
    guestIdFromHeader,
    guestIdFromCookie,
    guestIdFromRequest,
    guestIdFromSession
  );

  const sessionId =
    sessionIdHeader ??
    extractSessionIdLoose(sessionMetaObject) ??
    extractSessionIdLoose(body) ??
    null;

  log.info("[ask-eco] payload_valid", {
    origin: origin ?? null,
    guestId: guestIdResolved ?? null,
    sessionId,
  });

  const identityKey =
    (typeof reqWithIdentity.user?.id === "string" && reqWithIdentity.user.id.trim()
      ? reqWithIdentity.user.id.trim()
      : null) ??
    (typeof reqWithIdentity.guestId === "string" && reqWithIdentity.guestId.trim()
      ? reqWithIdentity.guestId.trim()
      : null);
  const authUid =
    typeof reqWithIdentity.user?.id === "string" && reqWithIdentity.user.id.trim().length
      ? reqWithIdentity.user.id.trim()
      : null;
  const hasGuestId = Boolean(identityKey);
  const userMode = reqWithIdentity.user?.id ? "authenticated" : "guest";

  log.info("[ask-eco] request", {
    origin: origin ?? null,
    mode: wantsStream ? "sse" : "json",
    hasGuestId,
    userMode,
    identityKey,
    payloadShape,
  });

  try {
    if (!normalized.messages.length) {
      throw createHttpError(400, "BAD_REQUEST", "Payload inválido (text/mensagem/mensagens)");
    }

    const hasUserMessage = normalized.messages.some(
      (msg) => msg.role === "user" && typeof msg.content === "string" && msg.content.trim()
    );

    if (!hasUserMessage) {
      throw createHttpError(400, "BAD_REQUEST", "Inclua ao menos uma mensagem de usuário válida");
    }

    if (REQUIRE_GUEST_ID && !hasGuestId) {
      throw createHttpError(400, "MISSING_GUEST_ID", "Informe X-Eco-Guest-Id");
    }

    if (clientMessageId) {
      const dedupeIdentity =
        identityKey ??
        (typeof usuario_id === "string" && usuario_id.trim() ? usuario_id.trim() : null) ??
        guestIdResolved ??
        (typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null);
      clientMessageKey = buildClientMessageKey(dedupeIdentity ?? null, clientMessageId);
      const reservation = reserveClientMessage(clientMessageKey);
      if (reservation.ok === false) {
        const duplicateStatus = reservation.status;
        log.warn("[ask-eco] duplicate_client_message", {
          clientMessageId,
          status: duplicateStatus,
          identity: dedupeIdentity ?? null,
        });
        return res.status(409).json({
          ok: false,
          code: "DUPLICATE_CLIENT_MESSAGE",
          error: "Interação já processada",
          status: duplicateStatus,
        });
      }
      clientMessageReserved = true;
    }

    const bearer =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;

    const params: Record<string, unknown> = {
      messages: normalized.messages,
      isGuest: isGuestRequest,
      authUid: authUid ?? null,
    };

    if (typeof bearer === "string" && bearer.trim()) {
      (params as any).accessToken = bearer.trim();
    }
    if (typeof clientHour === "number" && Number.isFinite(clientHour)) {
      (params as any).clientHour = clientHour;
    }
    if (sessionMetaObject) {
      (params as any).sessionMeta = sessionMetaObject;
    }
    if (typeof nome_usuario === "string" && nome_usuario.trim()) {
      (params as any).userName = nome_usuario.trim();
    }
    if (typeof usuario_id === "string" && usuario_id.trim()) {
      (params as any).userId = usuario_id.trim();
    }
    if (typeof reqWithIdentity.guestId === "string" && reqWithIdentity.guestId.trim()) {
      (params as any).guestId = reqWithIdentity.guestId.trim();
    } else if (guestIdResolved) {
      (params as any).guestId = guestIdResolved;
    }

    if (identityKey && typeof (params as any).distinctId !== "string") {
      (params as any).distinctId = identityKey;
    }
    if (identityKey && typeof (params as any).userId !== "string") {
      (params as any).userId = identityKey;
    }

    // JSON mode
    if (!wantsStream) {
      try {
        const result = await getEcoResponse(params as any);
        const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
        log.info("[ask-eco] response", {
          mode: "json",
          hasContent: textOut.length > 0,
        });
        const tokens = (() => {
          const usageSource =
            (result as any)?.usage ||
            (result as any)?.token_usage ||
            (result as any)?.tokens ||
            (result as any)?.meta?.usage ||
            (result as any)?.meta?.token_usage ||
            (result as any)?.meta?.tokens ||
            {};
          const inValue =
            usageSource?.prompt_tokens ??
            usageSource?.input_tokens ??
            usageSource?.tokens_in ??
            usageSource?.in ??
            (result as any)?.prompt_tokens ??
            (result as any)?.input_tokens ??
            null;
          const outValue =
            usageSource?.completion_tokens ??
            usageSource?.output_tokens ??
            usageSource?.tokens_out ??
            usageSource?.out ??
            (result as any)?.completion_tokens ??
            (result as any)?.output_tokens ??
            null;
          return {
            in: typeof inValue === "number" && Number.isFinite(inValue) ? Number(inValue) : null,
            out: typeof outValue === "number" && Number.isFinite(outValue) ? Number(outValue) : null,
          };
        })();

        const resultMeta = (result as any)?.meta;
        const metaPayload =
          resultMeta && typeof resultMeta === "object"
            ? { ...(resultMeta as Record<string, unknown>) }
            : null;
        const rawTimings = (result as any)?.timings;
        const timingsPayload =
          rawTimings && typeof rawTimings === "object"
            ? { ...(rawTimings as Record<string, unknown>) }
            : null;

        const donePayload = buildDonePayload({
          content: textOut || null,
          interactionId:
            typeof resultMeta?.interaction_id === "string" ? resultMeta.interaction_id : null,
          tokens,
          meta: metaPayload,
          timings: timingsPayload,
        });

        if (clientMessageReserved && clientMessageKey) {
          markClientMessageCompleted(clientMessageKey);
          clientMessageReserved = false;
        }

        return res.status(200).json(donePayload);
      } catch (error) {
        if (clientMessageReserved && clientMessageKey) {
          releaseClientMessage(clientMessageKey);
          clientMessageReserved = false;
        }
        if (isHttpError(error)) {
          log.warn("[ask-eco] json_error", { code: (error as any).body?.code, status: error.status });
          return res.status(error.status).json((error as any).body);
        }
        const traceId = randomUUID();
        log.error("[ask-eco] json_unexpected", { trace_id: traceId, message: (error as Error)?.message });
        return res.status(500).json({ code: "INTERNAL_ERROR", trace_id: traceId });
      }
    }

    // SSE mode
    res.status(200);
    disableCompressionForSse(res);
    prepareSseHeaders(res, {
      origin: allowedOrigin && origin ? origin : undefined,
      allowCredentials: false,
    });

    console.info("[ask-eco] start", {
      origin: origin ?? null,
      streamId: streamId ?? null,
    });

    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    const activeInteractionKeys = new Set<string>();

    const registerActiveInteractionKey = (key: string | null | undefined): boolean => {
      if (!key) return true;
      const trimmed = key.trim();
      if (!trimmed) return true;
      const ok = reserveActiveInteraction(trimmed, abortController);
      if (ok) {
        activeInteractionKeys.add(trimmed);
      }
      return ok;
    };

    const releaseActiveInteractionKeys = () => {
      if (!activeInteractionKeys.size) return;
      for (const key of activeInteractionKeys) {
        releaseActiveInteraction(key, abortController);
      }
      activeInteractionKeys.clear();
    };

    const streamContextKey = (() => {
      if (typeof streamId === "string" && streamId.trim()) {
        return `stream:${streamId.trim()}`;
      }
      if (typeof sessionId === "string" && sessionId.trim()) {
        return `session:${sessionId.trim()}`;
      }
      return null;
    })();

    const releaseActiveStream = () => {
      releaseActiveInteractionKeys();
      if (!streamContextKey) return;
      const current = activeStreamSessions.get(streamContextKey);
      if (current && current.controller === abortController) {
        activeStreamSessions.delete(streamContextKey);
      }
    };

    if (streamContextKey) {
      const existing = activeStreamSessions.get(streamContextKey);
      if (existing) {
        try {
          existing.controller.abort(new Error("superseded_stream"));
        } catch (error) {
          log.warn("[ask-eco] prior_stream_abort_failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      activeStreamSessions.set(streamContextKey, {
        controller: abortController,
        interactionId: "",
      });
    }

    if (clientMessageKey) {
      const activeKey = buildActiveInteractionKey("client", clientMessageKey);
      if (!registerActiveInteractionKey(activeKey)) {
        log.warn("[ask-eco] active_interaction_conflict", {
          clientMessageId: clientMessageId ?? null,
          identity: identityKey ?? null,
          origin: origin ?? null,
        });
        if (clientMessageReserved) {
          releaseClientMessage(clientMessageKey);
          clientMessageReserved = false;
        }
        releaseActiveInteractionKeys();
        return res.status(409).json({
          ok: false,
          code: "STREAM_ALREADY_ACTIVE",
          error: "Já existe uma interação ativa para esta mensagem.",
        });
      }
    }

    const telemetryClient = (() => {
      const client = getSupabaseAdmin();
      if (!client) return null;
      try {
        return client.schema("analytics");
      } catch {
        return null;
      }
    })();

    const fallbackInteractionId = randomUUID();
    (params as any).interactionId = fallbackInteractionId;
    (params as any).abortSignal = abortSignal;

    registerActiveInteractionKey(
      buildActiveInteractionKey("interaction", fallbackInteractionId)
    );

    const pendingSignals: Array<{ signal: string; meta: Record<string, unknown> }> = [];
    let resolvedInteractionId: string = fallbackInteractionId;
    let interactionIdReady = false;

    const finalizeClientMessageReservation = (finishReason?: string | null) => {
      if (!clientMessageReserved || !clientMessageKey) {
        return;
      }
      const reason = typeof finishReason === "string" ? finishReason.toLowerCase() : "";
      const isFailure =
        reason.includes("error") ||
        reason === "timeout" ||
        reason === "aborted" ||
        reason === "client_closed" ||
        reason === "superseded_stream";
      if (isFailure) {
        releaseClientMessage(clientMessageKey);
      } else {
        markClientMessageCompleted(clientMessageKey);
      }
      clientMessageReserved = false;
    };

    const updateActiveStreamInteractionId = (interactionId: string) => {
      if (!streamContextKey) return;
      const current = activeStreamSessions.get(streamContextKey);
      if (current && current.controller === abortController) {
        activeStreamSessions.set(streamContextKey, {
          controller: abortController,
          interactionId,
        });
      }
    };


    const compactMeta = (meta: Record<string, unknown>): Record<string, unknown> => {
      return Object.entries(meta).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
      }, {});
    };

    const sendSignalRow = (interactionId: string, signal: string, meta: Record<string, unknown>) => {
      if (!telemetryClient) return;
      const payload = { interaction_id: interactionId, signal, meta };
      void Promise.resolve(
        telemetryClient
          .from("eco_passive_signals")
          .insert([payload])
      )
        .then(({ error }) => {
          if (error) {
            log.error("[ask-eco] telemetry_failed", {
              signal,
              message: error.message,
              code: error.code ?? null,
              table: "eco_passive_signals",
              payload,
            });
            return;
          }
          log.info("[ask-eco] telemetry_inserted", {
            signal,
            table: "eco_passive_signals",
            interaction_id: interactionId,
          });
        })
        .catch((error: unknown) => {
          log.error("[ask-eco] telemetry_failed", {
            signal,
            message: error instanceof Error ? error.message : String(error),
            table: "eco_passive_signals",
            payload,
          });
        });
    };

    const flushPendingSignals = () => {
      if (!interactionIdReady || !pendingSignals.length) return;
      const queued = pendingSignals.splice(0, pendingSignals.length);
      for (const item of queued) {
        sendSignalRow(resolvedInteractionId, item.signal, item.meta);
      }
    };

    const captureInteractionId = (value: unknown) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      if (interactionIdReady) {
        if (resolvedInteractionId !== trimmed) {
        log.warn("[ask-eco] interaction_id_mismatch", {
          current: resolvedInteractionId,
          incoming: trimmed,
        });
        }
        return;
      }
      resolvedInteractionId = trimmed;
      interactionIdReady = true;
      updateActiveStreamInteractionId(trimmed);
      const interactionKey = buildActiveInteractionKey("interaction", trimmed);
      if (!registerActiveInteractionKey(interactionKey)) {
        log.warn("[ask-eco] active_interaction_conflict", {
          interactionId: trimmed,
          clientMessageId: clientMessageId ?? null,
          origin: origin ?? null,
        });
      }
      flushPendingSignals();
    };

    const enqueuePassiveSignal = (
      signal: string,
      value?: number | null,
      meta?: Record<string, unknown>
    ) => {
      if (!telemetryClient) return;
      let serializedMeta: Record<string, unknown> = {};
      if (meta && typeof meta === "object") {
        serializedMeta = compactMeta(meta);
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        serializedMeta = { ...serializedMeta, value };
      }

      try {
        serializedMeta = JSON.parse(JSON.stringify(serializedMeta));
      } catch (error) {
        log.debug("[ask-eco] telemetry_meta_failed", {
          signal,
          message: error instanceof Error ? error.message : String(error),
        });
        serializedMeta = {};
      }

      if (interactionIdReady) {
        sendSignalRow(resolvedInteractionId, signal, serializedMeta);
        return;
      }

      pendingSignals.push({ signal, meta: serializedMeta });
    };

    const state = {
      done: false,
      sawChunk: false,
      finishReason: "" as string | undefined,
      clientClosed: false,
      firstSent: false,
      t0: Date.now(),
      firstTokenAt: 0,
      chunksCount: 0,
      bytesCount: 0,
      lastChunkAt: 0,
      model: null as string | null,
      firstTokenTelemetrySent: false,
      endLogged: false,
      contentPieces: [] as string[],
      metaPayload: {} as Record<string, unknown>,
      memoryEvents: [] as Array<Record<string, unknown>>,
      usageTokens: { in: null as number | null, out: null as number | null },
      latencyMarks: {} as Record<string, unknown>,
      streamResult: null as Record<string, unknown> | null,
    };

    const consoleStreamEnd = (payload?: Record<string, unknown>) => {
      if (state.endLogged) return;
      state.endLogged = true;
      console.info("[ask-eco] end", {
        origin: origin ?? null,
        streamId: streamId ?? null,
        ...(payload ?? {}),
      });
    };

    const updateUsageTokens = (meta: any) => {
      if (!meta || typeof meta !== "object") return;
      const source = meta as Record<string, any>;
      const usage = source.usage || source.token_usage || source.tokens || {};
      const maybeIn =
        usage?.prompt_tokens ??
        usage?.input_tokens ??
        usage?.tokens_in ??
        usage?.in ??
        source.prompt_tokens ??
        source.input_tokens ??
        null;
      const maybeOut =
        usage?.completion_tokens ??
        usage?.output_tokens ??
        usage?.tokens_out ??
        usage?.out ??
        source.completion_tokens ??
        source.output_tokens ??
        null;

      if (typeof maybeIn === "number" && Number.isFinite(maybeIn)) {
        state.usageTokens.in = Number(maybeIn);
      }
      if (typeof maybeOut === "number" && Number.isFinite(maybeOut)) {
        state.usageTokens.out = Number(maybeOut);
      }
    };

    const mergeLatencyMarks = (marks: Record<string, unknown> | null | undefined) => {
      if (!marks || typeof marks !== "object") return;
      state.latencyMarks = { ...state.latencyMarks, ...marks };
    };

    const idleTimeoutMs =
      Number.isFinite(streamTimeoutMs) && streamTimeoutMs > 0 ? streamTimeoutMs : 120_000;

    let initialInteractionId: string | null = null;
    try {
      const resolvedUserIdForInteraction =
        !isGuestRequest && typeof (params as any).userId === "string"
          ? ((params as any).userId as string).trim()
          : null;
      const normalizedSessionId =
        typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
      initialInteractionId = await createInteraction({
        userId:
          resolvedUserIdForInteraction && resolvedUserIdForInteraction.length
            ? resolvedUserIdForInteraction
            : null,
        sessionId: normalizedSessionId,
        messageId: lastMessageId,
        promptHash: null,
      });
    } catch (error) {
      log.warn("[ask-eco] interaction_create_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (initialInteractionId && typeof initialInteractionId === "string") {
      captureInteractionId(initialInteractionId);
      (params as any).interactionId = resolvedInteractionId;
    } else {
      captureInteractionId(resolvedInteractionId);
    }

    const sse = createSSE(res, req, {
      heartbeatMs: 25_000,
      idleMs: idleTimeoutMs,
      onIdle: handleStreamTimeout,
    });

    log.info("[ask-eco] stream_start", {
      origin: origin ?? null,
      idleTimeoutMs,
    });

    const interactionEventPayload: Record<string, unknown> = {
      interaction_id: resolvedInteractionId,
    };
    sse.send("interaction", interactionEventPayload);

    const recordFirstTokenTelemetry = (chunkBytes: number) => {
      if (state.firstTokenTelemetrySent) return;
      state.firstTokenTelemetrySent = true;
      const latency = state.firstTokenAt ? state.firstTokenAt - state.t0 : null;
      enqueuePassiveSignal(
        "first_token",
        1,
        compactMeta({ latency_ms: latency ?? undefined, chunk_bytes: chunkBytes })
      );
    };

    let abortListener: (() => void) | null = null;

    function sendMeta(obj: Record<string, unknown>) {
      state.metaPayload = { ...state.metaPayload, ...obj };
      sse.send("meta", obj);
    }

    function sendMemorySaved(obj: Record<string, unknown>) {
      state.memoryEvents.push(obj);
      sse.send("memory_saved", obj);
    }

    function sendLatency(payload: Record<string, unknown>) {
      sse.send("latency", payload);
    }

    function sendErrorEvent(payload: Record<string, unknown>) {
      log.error("[ask-eco] sse_error", { ...payload });
      sse.send("error", payload);
    }

    function sendDone(reason?: string | null) {
      if (state.done) return;
      state.finishReason = reason ?? state.finishReason ?? "unknown";
      state.done = true;

      const firstTokenLatency = state.firstTokenAt ? state.firstTokenAt - state.t0 : null;
      const finishedAt = state.lastChunkAt || Date.now();
      const totalLatency = finishedAt - state.t0;

      sendMeta({
        type: "llm_status",
        firstTokenLatencyMs: firstTokenLatency,
        chunks: state.chunksCount,
        bytes: state.bytesCount,
      });

      const finishReason = state.finishReason || "unknown";
      if (state.sawChunk) {
        log.info("[ask-eco] sse_done", {
          finishReason,
          sawChunk: state.sawChunk,
          chunks: state.chunksCount,
          bytes: state.bytesCount,
        });
      } else {
        log.debug("[ask-eco] sse_done_no_chunk", {
          finishReason,
          clientClosed: state.clientClosed,
        });
      }

      const streamMeta = state.streamResult && typeof state.streamResult === "object"
        ? (state.streamResult as Record<string, unknown>)
        : null;

      updateUsageTokens(streamMeta);
      updateUsageTokens(streamMeta?.meta);
      mergeLatencyMarks(streamMeta?.timings as Record<string, unknown> | undefined);

      const aggregatedMeta = (() => {
        const combined: Record<string, unknown> = { ...state.metaPayload };
        if (streamMeta?.meta && typeof streamMeta.meta === "object") {
          Object.assign(combined, streamMeta.meta as Record<string, unknown>);
        }
        if (state.memoryEvents.length) {
          combined.memory_events = state.memoryEvents;
        }
        return Object.keys(combined).length ? combined : null;
      })();

      if (streamMeta?.timings && typeof streamMeta.timings === "object") {
        mergeLatencyMarks(streamMeta.timings as Record<string, unknown>);
      }

      const latencyPayload = compactMeta({
        first_token_latency_ms: firstTokenLatency ?? undefined,
        total_latency_ms: totalLatency,
        marks: Object.keys(state.latencyMarks).length ? state.latencyMarks : undefined,
      });

      if (Object.keys(latencyPayload).length) {
        sendLatency(latencyPayload);
      }

      const donePayload = buildDonePayload({
        content: state.contentPieces.join("").trim() || null,
        interactionId:
          resolvedInteractionId ??
          (typeof streamMeta?.meta === "object"
            ? ((streamMeta.meta as Record<string, unknown>).interaction_id as string | undefined) ?? null
            : null),
        tokens: state.usageTokens,
        meta: aggregatedMeta ?? null,
        timings: Object.keys(state.latencyMarks).length ? state.latencyMarks : null,
        firstTokenLatency,
        totalLatency,
        timestamp: finishedAt,
      });

      sse.send("done", donePayload);

      sse.sendControl("done", {
        reason: finishReason,
        totalChunks: state.chunksCount,
        bytes: state.bytesCount,
        durationMs: totalLatency,
        summary: donePayload,
      });

      log.info("[ask-eco] stream_finalize", {
        origin: origin ?? null,
        interaction_id: resolvedInteractionId ?? null,
        clientMessageId: clientMessageId ?? null,
        stream_aborted: abortSignal.aborted,
        final_chunk_sent: state.sawChunk,
        finishReason,
      });

      finalizeClientMessageReservation(finishReason);

      log.info("[ask-eco] stream_end", {
        finishReason,
        chunks: state.chunksCount,
        bytes: state.bytesCount,
        clientClosed: state.clientClosed,
        origin: origin ?? null,
      });

      const endPayload: Record<string, unknown> = {};
      if (finishReason) {
        endPayload.finishReason = finishReason;
      }
      consoleStreamEnd(Object.keys(endPayload).length ? endPayload : undefined);

      const doneValue = finishReason === "error" || finishReason === "timeout" ? 0 : 1;
      enqueuePassiveSignal(
        "done",
        doneValue,
        compactMeta({
          finish_reason: finishReason,
          chunks: state.chunksCount,
          bytes: state.bytesCount,
          first_token_latency_ms: firstTokenLatency ?? undefined,
          total_latency_ms: totalLatency,
          model: state.model ?? undefined,
          saw_chunk: state.sawChunk,
        })
      );

      if (abortListener) {
        abortSignal.removeEventListener("abort", abortListener);
        abortListener = null;
      }
      releaseActiveStream();

      sse.end();
    }

    function handleStreamTimeout() {
      if (state.done || state.clientClosed || state.sawChunk) {
        return;
      }
      log.warn("[ask-eco] sse_timeout", { timeoutMs: idleTimeoutMs });
      sendChunk(STREAM_TIMEOUT_MESSAGE);
      sendDone("timeout");
    }

    function sendChunk(piece: string) {
      if (!piece || typeof piece !== "string") return;
      const cleaned = sanitizeOutput(piece);
      const finalText = cleaned || piece.trim();
      if (!finalText) return;

      state.sawChunk = true;
      const chunkIndex = state.chunksCount;
      const chunkBytes = Buffer.byteLength(finalText, "utf8");
      state.bytesCount += chunkBytes;
      const now = Date.now();
      state.lastChunkAt = now;

      if (!state.firstSent) {
        state.firstSent = true;
        state.firstTokenAt = now;
        sendMeta({ type: "first_token_latency_ms", value: state.firstTokenAt - state.t0 });
        recordFirstTokenTelemetry(chunkBytes);
      }

      const chunkPayload = {
        interaction_id: resolvedInteractionId,
        index: chunkIndex,
        delta: finalText,
      };
      sse.send("chunk", chunkPayload);

      state.chunksCount = chunkIndex + 1;
      state.contentPieces.push(finalText);
    }

    const promptReadyMeta: Record<string, unknown> = { stream: true };
    if (resolvedInteractionId) {
      promptReadyMeta.interaction_id = resolvedInteractionId;
    }
    abortListener = () => {
      if (state.done) {
        if (abortListener) {
          abortSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }
        releaseActiveStream();
        return;
      }
      const reasonValue = abortSignal.reason;
      const finishReason = (() => {
        if (typeof reasonValue === "string" && reasonValue.trim()) {
          return reasonValue.trim();
        }
        if (reasonValue instanceof Error) {
          const message = reasonValue.message?.trim();
          if (message) return message;
          return reasonValue.name || "aborted";
        }
        return "aborted";
      })();
      if (finishReason === "client_closed") {
        log.info("[ask-eco] sse_client_closed", {
          origin,
        });
      } else if (finishReason === "superseded_stream") {
        log.info("[ask-eco] sse_stream_replaced", {
          origin: origin ?? null,
          streamId: streamId ?? null,
        });
      }
      state.clientClosed = state.clientClosed || finishReason === "client_closed";
      sendDone(finishReason || "aborted");
    };
    abortSignal.addEventListener("abort", abortListener);
    sse.sendControl("prompt_ready", promptReadyMeta);
    enqueuePassiveSignal("prompt_ready", 1, {
      stream: true,
      origin: origin ?? null,
    });

    req.on("close", () => {
      if (state.clientClosed) return;
      state.clientClosed = true;
      if (!abortSignal.aborted) {
        abortController.abort(new Error("client_closed"));
      }
    });

    const forwardEvent = (rawEvt: EcoStreamEvent | any) => {
      if (state.done || state.clientClosed) return;
      const evt = rawEvt as any;
      const type = String(evt?.type || "");

      switch (type) {
        case "control": {
          const name = typeof evt?.name === "string" ? evt.name : "";
          const meta = evt?.meta && typeof evt.meta === "object" ? (evt.meta as Record<string, unknown>) : null;
          if (meta) {
            captureInteractionId((meta as { interaction_id?: unknown }).interaction_id);
            const maybeModel =
              typeof meta.model === "string"
                ? meta.model
                : typeof (meta as any).modelo === "string"
                ? (meta as any).modelo
                : undefined;
            if (maybeModel) state.model = maybeModel;
            updateUsageTokens(meta);
          }
          if (evt?.timings && typeof evt.timings === "object") {
            mergeLatencyMarks(evt.timings as Record<string, unknown>);
          }
          if (name === "meta" && meta) {
            sendMeta(meta);
            return;
          }
          if (name === "memory_saved" && meta) {
            sendMemorySaved(meta);
            return;
          }
          if (name === "done") {
            sendDone(evt?.meta?.finishReason ?? evt?.finishReason ?? "done");
          }
          return;
        }
        case "first_token": {
          const text = extractEventText(evt);
          if (typeof text === "string" && text && state.chunksCount === 0) {
            sendChunk(text);
          }
          return;
        }
        case "chunk":
        case "delta":
        case "token": {
          const text = extractEventText(evt);
          if (typeof text === "string" && text) {
            sendChunk(text);
          }
          return;
        }
        case "done": {
          const meta = evt?.meta && typeof evt.meta === "object" ? (evt.meta as Record<string, unknown>) : null;
          if (meta) {
            captureInteractionId((meta as { interaction_id?: unknown }).interaction_id);
            const maybeModel =
              typeof meta.model === "string"
                ? meta.model
                : typeof (meta as any).modelo === "string"
                ? (meta as any).modelo
                : undefined;
            if (maybeModel) state.model = maybeModel;
            updateUsageTokens(meta);
          }
          if (evt?.timings && typeof evt.timings === "object") {
            mergeLatencyMarks(evt.timings as Record<string, unknown>);
          }
          sendDone(evt?.meta?.finishReason ?? evt?.finishReason ?? "done");
          return;
        }
        case "error": {
          const message =
            typeof evt?.message === "string"
              ? evt.message
              : evt?.error?.message || "Erro desconhecido";
          sendErrorEvent({ message });
          sendDone("error");
          return;
        }
        default: {
          const text = extractEventText(evt);
          if (typeof text === "string" && text) {
            sendChunk(text);
          }
          return;
        }
      }
    };

    try {
      const stream: EcoStreamHandler = { onEvent: (event) => forwardEvent(event) };
      const result = await getEcoResponse({ ...params, stream } as any);

      if (result && typeof result === "object") {
        const maybeModel =
          typeof (result as any).modelo === "string"
            ? (result as any).modelo
            : typeof (result as any).model === "string"
            ? (result as any).model
            : undefined;
        if (maybeModel) state.model = maybeModel;
        state.streamResult = result as Record<string, unknown>;
        captureInteractionId((result as any)?.meta?.interaction_id);
        updateUsageTokens(result);
        updateUsageTokens((result as any)?.meta);
        if ((result as any)?.timings && typeof (result as any).timings === "object") {
          mergeLatencyMarks((result as any).timings as Record<string, unknown>);
        }
      }

      if (!state.done) {
        if (!state.sawChunk) {
          const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
          if (textOut) {
            sendChunk(textOut);
          }
          sendDone(textOut ? "fallback_no_stream" : "fallback_empty");
        } else {
          sendDone("stream_done");
        }
      }
    } catch (error) {
      if (abortSignal.aborted) {
        const reasonValue = abortSignal.reason;
        const reasonMessage = (() => {
          if (typeof reasonValue === "string" && reasonValue.trim()) {
            return reasonValue.trim();
          }
          if (reasonValue instanceof Error) {
            return reasonValue.message?.trim() || reasonValue.name || "aborted";
          }
          return "aborted";
        })();
        log.info("[ask-eco] stream_aborted", {
          origin: origin ?? null,
          reason: reasonMessage,
        });
        sendDone(reasonMessage || "aborted");
      } else if (isHttpError(error)) {
        sendErrorEvent({ ...error.body, status: error.status });
        sendDone("error");
      } else {
        const traceId = randomUUID();
        log.error("[ask-eco] sse_unexpected", {
          trace_id: traceId,
          message: (error as Error)?.message,
        });
        sendErrorEvent({ code: "INTERNAL_ERROR", trace_id: traceId });
        sendDone("error");
      }
    } finally {
      if (clientMessageReserved && clientMessageKey) {
        releaseClientMessage(clientMessageKey);
        clientMessageReserved = false;
      }
      if (!state.done) {
        if (abortListener) {
          abortSignal.removeEventListener("abort", abortListener);
          abortListener = null;
        }
        releaseActiveStream();
        sse.end();
      }
    }
  } catch (error) {
    if (clientMessageReserved && clientMessageKey) {
      releaseClientMessage(clientMessageKey);
      clientMessageReserved = false;
    }
    if (isHttpError(error)) {
      return res.status(error.status).json(error.body);
    }
    const traceId = randomUUID();
    log.error("[ask-eco] validation_unexpected", { trace_id: traceId, message: (error as Error)?.message });
    return res.status(500).json({ code: "INTERNAL_ERROR", trace_id: traceId });
  }
});

router.use("/ask-eco", askEcoRouter);

export default router;
