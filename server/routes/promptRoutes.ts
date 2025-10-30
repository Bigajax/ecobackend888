import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import type { ParsedQs } from "qs";
import { getPromptEcoPreview } from "../controllers/promptController";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import { log } from "../services/promptContext/logger";
import type { EcoStreamHandler, EcoStreamEvent } from "../services/conversation/types";
import { createHttpError, isHttpError } from "../utils/http";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { createSSE, prepareSse } from "../utils/sse";
import { smartJoin as smartStreamJoin } from "../utils/streamJoin";
import {
  rememberInteractionGuest,
  updateInteractionGuest,
} from "../services/conversation/interactionIdentityStore";
import { resolveCorsOrigin, PRIMARY_CORS_ORIGIN } from "../middleware/cors";
import {
  ensureIdentity,
  type RequestWithIdentity as RequestWithEcoIdentity,
} from "../middleware/ensureIdentity";
import { createInteraction } from "../services/conversation/interactionAnalytics";
import { extractTextLoose, sanitizeOutput } from "../utils/textExtractor";
import { getGuestIdFromCookies, resolveGuestId } from "../utils/guestIdResolver";
import {
  validateAskEcoPayload,
  type ValidationError,
  type ValidationResult,
} from "../validation/payloadValidator";
import { SseStreamState } from "../sse/sseState";
import { SseEventHandlers } from "../sse/sseEvents";
import { SseTelemetry } from "../sse/sseTelemetry";
import {
  activeStreamSessions,
  buildActiveInteractionKey,
  releaseActiveInteraction,
  reserveActiveInteraction,
} from "../deduplication/activeStreamManager";
import {
  buildClientMessageKey,
  markClientMessageCompleted,
  releaseClientMessage,
  reserveClientMessage,
} from "../deduplication/clientMessageRegistry";
import { extractStringCandidate } from "../utils/requestIdentity";

/**
 * Eco — /api/ask-eco (SSE + JSON fallback)
 *
 * Ajustes principais nesta versão:
 * 1) Fechamentos e chaves balanceadas para evitar TS1128.
 * 2) Remoção de import não utilizado (extractEventText).
 * 3) Pequenos guards para headers após início do SSE.
 * 4) Normalização de retornos no fluxo de erro.
 */

const GUARD_FALLBACK_TEXT = "Não consegui responder agora. Vamos tentar de novo?";
const INVALID_INPUT_MESSAGE = "Entrada inválida. Escreva uma mensagem para o Eco.";

// === Tipos utilitários ===

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

  if (firstTokenLatency != null) payloadTimings.firstTokenLatencyMs = firstTokenLatency;
  if (totalLatency != null) payloadTimings.totalLatencyMs = totalLatency;

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

// === Router setup ===

const router = Router();
const askEcoRouter = Router();

function buildSummaryFromChunks(pieces: string[]): string {
  if (!Array.isArray(pieces) || pieces.length === 0) return "";
  const summary = pieces.reduce<string>((acc, piece) => (acc ? smartStreamJoin(acc, piece) : piece), "");
  if (!summary) return "";
  let normalized = summary.replace(/[ \t]*\n[ \t]*/g, "\n");
  normalized = normalized.replace(/([a-zá-ú])([A-ZÁ-Ú])/g, "$1 $2");
  return normalized;
}

function parseJsonRecord(raw: string | undefined): Record<string, unknown> | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return undefined;
}

function parseJsonArray(raw: string | undefined): unknown[] | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as unknown[];
  } catch {
    /* ignore */
  }
  return undefined;
}

function buildAskEcoQueryPayload(req: Request): Record<string, unknown> {
  const query = (req.query as ParsedQs | undefined) ?? undefined;
  if (!query) return {};

  const body: Record<string, unknown> = {};

  const mergeFromPayload = () => {
    const rawPayload = extractStringCandidate(query.payload);
    if (!rawPayload) return;
    const parsedPayload = parseJsonRecord(rawPayload);
    if (parsedPayload) Object.assign(body, parsedPayload);
  };

  mergeFromPayload();

  const assignIfMissing = (key: string, value: unknown) => {
    if (value == null) return;
    if (!(key in body)) body[key] = value;
  };

  const resolveMessages = () => {
    if ("messages" in body || "mensagens" in body) return;
    const rawMessages = (query as Record<string, unknown>).messages ?? (query as Record<string, unknown>).mensagens;
    if (rawMessages === undefined) return;
    const jsonMessages = parseJsonArray(extractStringCandidate(rawMessages as any));
    if (jsonMessages) {
      body.messages = jsonMessages;
      return;
    }
    if (Array.isArray(rawMessages)) body.messages = [...(rawMessages as unknown[])];
  };

  resolveMessages();

  const textCandidate =
    extractStringCandidate(query.texto) ??
    extractStringCandidate(query.text) ??
    extractStringCandidate(query.mensagem) ??
    extractStringCandidate((query as Record<string, unknown>).message);
  if (textCandidate && typeof textCandidate === "string") assignIfMissing("texto", textCandidate);

  const nomeUsuarioCandidate =
    extractStringCandidate(query.nome_usuario) ?? extractStringCandidate((query as Record<string, unknown>).nomeUsuario);
  if (nomeUsuarioCandidate) assignIfMissing("nome_usuario", nomeUsuarioCandidate);

  const usuarioIdCandidate =
    extractStringCandidate(query.usuario_id) ??
    extractStringCandidate((query as Record<string, unknown>).usuarioId) ??
    extractStringCandidate((query as Record<string, unknown>).user_id) ??
    extractStringCandidate((query as Record<string, unknown>).userId);
  if (usuarioIdCandidate) assignIfMissing("usuario_id", usuarioIdCandidate);

  const clientMessageCandidate =
    extractStringCandidate(query.client_message_id) ??
    extractStringCandidate((query as Record<string, unknown>).clientMessageId);
  if (clientMessageCandidate) assignIfMissing("client_message_id", clientMessageCandidate);

  const contextoCandidate = extractStringCandidate(query.contexto);
  if (contextoCandidate && !("contexto" in body))
    assignIfMissing("contexto", parseJsonRecord(contextoCandidate) ?? contextoCandidate);

  const sessionMetaCandidate = extractStringCandidate((query as Record<string, unknown>).sessionMeta as any);
  if (sessionMetaCandidate && !("sessionMeta" in body))
    assignIfMissing("sessionMeta", parseJsonRecord(sessionMetaCandidate) ?? sessionMetaCandidate);

  const isGuestCandidate = extractStringCandidate((query as Record<string, unknown>).isGuest as any);
  if (isGuestCandidate && !("isGuest" in body))
    assignIfMissing("isGuest", /^(1|true|yes)$/i.test(isGuestCandidate.trim()) ? true : isGuestCandidate);

  const streamCandidate = extractStringCandidate((query as Record<string, unknown>).stream as any);
  if (streamCandidate) assignIfMissing("stream", streamCandidate);

  const clientHourCandidate =
    extractStringCandidate((query as Record<string, unknown>).client_hour) ??
    extractStringCandidate((query as Record<string, unknown>).clientHour);
  if (clientHourCandidate && !("clientHour" in body)) {
    const parsedHour = Number(clientHourCandidate);
    assignIfMissing("clientHour", Number.isFinite(parsedHour) ? parsedHour : clientHourCandidate);
  }

  if (!("stream" in body)) body.stream = "true";

  return body;
}

// === SSE helpers ===

type SseConnection = ReturnType<typeof createSSE>;

function createGetResolvedInteractionId(telemetry: SseTelemetry) {
  return function getResolvedInteractionId(): string | undefined {
    return telemetry.getResolvedInteractionId() ?? undefined;
  };
}

function createGetSseConnectionRef(connectionRef: { current: SseConnection | null }) {
  return function getSseConnection(): SseConnection | null {
    return connectionRef.current;
  };
}

function createRecordFirstTokenTelemetry(state: SseStreamState, telemetry: SseTelemetry) {
  return function recordFirstTokenTelemetry(chunkBytes: number) {
    if (state.firstTokenTelemetrySent) return;
    state.markFirstTokenTelemetrySent();
    const latency = state.firstTokenAt ? state.firstTokenAt - state.t0 : null;
    telemetry.setFirstTokenLatency(latency);
    telemetry.recordFirstTokenTelemetry(
      chunkBytes,
      typeof latency === "number" && Number.isFinite(latency) ? latency : null
    );
  };
}

function createClearHeartbeatTimer(heartbeatRef: { current: NodeJS.Timeout | null }) {
  return function clearHeartbeatTimer() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };
}

function createClearEarlyClientAbortTimer(timerRef: { current: NodeJS.Timeout | null }) {
  return function clearEarlyClientAbortTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
}

function createClearAbortListenerRef(abortSignal: AbortSignal, abortListenerRef: { current: (() => void) | null }) {
  return function clearAbortListenerRef() {
    const listener = abortListenerRef.current;
    if (listener) {
      abortSignal.removeEventListener("abort", listener);
      abortListenerRef.current = null;
    }
  };
}

// === Handlers ===

type MakeHandlersParams = {
  state: SseStreamState;
  sse: SseConnection;
  context: { origin: string | null; clientMessageId: string | null; streamId: string | null };
  onTelemetry: (signal: string, value?: number | null, meta?: Record<string, unknown>) => void;
  guardFallbackText: string;
  idleTimeoutMs: number;
  getDoneSent: () => boolean;
  setDoneSent: (value: boolean) => void;
  clearHeartbeat: () => void;
  clearEarlyClientAbortTimer: () => void;
  getIsClosed: () => boolean;
  clearFirstTokenWatchdog: () => void;
  recordFirstTokenTelemetry: (chunkBytes: number) => void;
  updateUsageTokens: (meta: any) => void;
  mergeLatencyMarks: (marks?: Record<string, unknown>) => void;
  buildSummaryFromChunks: typeof buildSummaryFromChunks;
  buildDonePayload: typeof buildDonePayload;
  finalizeClientMessageReservation: (finishReason?: string | null) => void;
  getResolvedInteractionId: () => string | undefined;
  isInteractionIdReady: () => boolean;
  captureInteractionId: (value: unknown) => void;
  getInteractionBootstrapPromise: () => Promise<void>;
  sendLatency: (payload: Record<string, unknown>) => void;
  consoleStreamEnd: (payload?: Record<string, unknown>) => void;
  compactMeta: (meta: Record<string, unknown>) => Record<string, unknown>;
  abortSignal: AbortSignal;
  clearAbortListener: () => void;
  releaseActiveStream: () => void;
  onStreamEnd: () => void;
  getSseConnection: () => SseConnection | null;
  armFirstTokenWatchdog: () => void;
  streamHasChunkHandler: boolean;
  getRequestAborted: () => boolean;
};

type MakeHandlersResult = {
  handlers: SseEventHandlers;
  sendMeta: (obj: Record<string, unknown>) => void;
  sendMemorySaved: (obj: Record<string, unknown>) => void;
  sendErrorEvent: (payload: Record<string, unknown>) => void;
  ensureGuardFallback: (reason: string) => void;
  sendDone: (reason?: string | null) => void;
  sendChunk: (input: { text: string; index?: number; meta?: Record<string, unknown> }) => void;
  forwardEvent: (rawEvt: EcoStreamEvent | any) => void;
};

function makeHandlers(params: MakeHandlersParams): MakeHandlersResult {
  const {
    state,
    sse,
    context,
    onTelemetry,
    guardFallbackText,
    idleTimeoutMs,
    getDoneSent,
    setDoneSent,
    clearHeartbeat,
    clearEarlyClientAbortTimer,
    getIsClosed,
    clearFirstTokenWatchdog,
    recordFirstTokenTelemetry,
    updateUsageTokens,
    mergeLatencyMarks,
    buildSummaryFromChunks: buildSummary,
    buildDonePayload: buildDone,
    finalizeClientMessageReservation,
    getResolvedInteractionId,
    isInteractionIdReady,
    captureInteractionId,
    getInteractionBootstrapPromise,
    sendLatency,
    consoleStreamEnd,
    compactMeta,
    abortSignal,
    clearAbortListener,
    releaseActiveStream,
    onStreamEnd,
    getSseConnection,
    armFirstTokenWatchdog,
    streamHasChunkHandler,
    getRequestAborted,
  } = params;

  const handlers = new SseEventHandlers(state, sse, {
    origin: context.origin ?? null,
    clientMessageId: context.clientMessageId ?? null,
    streamId: context.streamId ?? null,
    onTelemetry,
    guardFallbackText,
    idleTimeoutMs,
    getDoneSent,
    setDoneSent,
    clearHeartbeat,
    clearEarlyClientAbortTimer,
    getIsClosed,
    clearFirstTokenWatchdog,
    recordFirstTokenTelemetry,
    updateUsageTokens,
    mergeLatencyMarks,
    buildSummaryFromChunks: buildSummary,
    buildDonePayload: buildDone,
    finalizeClientMessageReservation,
    getResolvedInteractionId,
    isInteractionIdReady,
    captureInteractionId,
    getInteractionBootstrapPromise,
    sendLatency,
    consoleStreamEnd,
    compactMeta,
    abortSignal,
    clearAbortListener,
    releaseActiveStream,
    onStreamEnd,
    getSseConnection,
    armFirstTokenWatchdog,
    streamHasChunkHandler,
    getRequestAborted,
  });

  return {
    handlers,
    sendMeta: (obj: Record<string, unknown>) => handlers.sendMeta(obj),
    sendMemorySaved: (obj: Record<string, unknown>) => handlers.sendMemorySaved(obj),
    sendErrorEvent: (payload: Record<string, unknown>) => handlers.sendErrorEvent(payload),
    ensureGuardFallback: (reason: string) => handlers.ensureGuardFallback(reason),
    sendDone: (reason?: string | null) => handlers.sendDone(reason),
    sendChunk: (input: { text: string; index?: number; meta?: Record<string, unknown> }) => handlers.sendChunk(input),
    forwardEvent: (rawEvt: EcoStreamEvent | any) => handlers.forwardEvent(rawEvt),
  };
}

const activeClientMessageLocks = new Map<string, true>();

export { askEcoRouter as askEcoRoutes };

// === Config ===

const REQUIRE_GUEST_ID = String(process.env.ECO_REQUIRE_GUEST_ID ?? "false").toLowerCase() === "true";

const DEFAULT_IDLE_TIMEOUT_MS = 55_000;
const MIN_IDLE_TIMEOUT_MS = 45_000;
const MAX_IDLE_TIMEOUT_MS = 60_000;
const rawIdleTimeout = (() => {
  const raw = process.env.ECO_SSE_TIMEOUT_MS;
  if (!raw) return DEFAULT_IDLE_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IDLE_TIMEOUT_MS;
  return parsed;
})();

const IS_TEST_ENV = String(process.env.NODE_ENV).toLowerCase() === "test";
const streamIdleTimeoutMs = IS_TEST_ENV
  ? rawIdleTimeout
  : Math.min(Math.max(rawIdleTimeout, MIN_IDLE_TIMEOUT_MS), MAX_IDLE_TIMEOUT_MS);

const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 35_000;
const MIN_FIRST_TOKEN_TIMEOUT_MS = 30_000;
const MAX_FIRST_TOKEN_TIMEOUT_MS = 45_000;
const firstTokenTimeoutMs = (() => {
  const raw = process.env.ECO_FIRST_TOKEN_TIMEOUT_MS;
  if (!raw) return DEFAULT_FIRST_TOKEN_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FIRST_TOKEN_TIMEOUT_MS;
  return parsed;
})();

const TEST_FIRST_TOKEN_TIMEOUT_MS = 4_000;
const firstTokenWatchdogMs = IS_TEST_ENV
  ? TEST_FIRST_TOKEN_TIMEOUT_MS
  : Math.min(Math.max(firstTokenTimeoutMs, MIN_FIRST_TOKEN_TIMEOUT_MS), MAX_FIRST_TOKEN_TIMEOUT_MS);

const DEFAULT_PING_INTERVAL_MS = 12_000;
const MIN_PING_INTERVAL_MS = 10_000;
const MAX_PING_INTERVAL_MS = 15_000;
const resolvedPingIntervalMs = (() => {
  const raw = process.env.ECO_SSE_PING_INTERVAL_MS;
  if (!raw) return DEFAULT_PING_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PING_INTERVAL_MS;
  return parsed;
})();

const TEST_PING_INTERVAL_MS = 2_000;
const streamPingIntervalMs = IS_TEST_ENV
  ? TEST_PING_INTERVAL_MS
  : Math.min(Math.max(resolvedPingIntervalMs, MIN_PING_INTERVAL_MS), MAX_PING_INTERVAL_MS);

// === Identity ===

type RequestWithIdentity = RequestWithEcoIdentity & { user?: { id?: string | null } | null };

function isValidationFailure(result: ValidationResult): result is { valid: false; error: ValidationError } {
  return result.valid === false;
}

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
  response.setHeader("Content-Encoding", "identity");
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

const ASK_ECO_ALLOWED_HEADERS_VALUE =
  "content-type, x-client-id, x-eco-guest-id, x-eco-session-id, x-eco-client-message-id";
const ASK_ECO_ALLOWED_METHODS_VALUE = "GET,POST,OPTIONS";
const ASK_ECO_EXPOSE_HEADERS_VALUE = "x-eco-guest-id, x-eco-session-id, x-eco-client-message-id";

function applyAskEcoCorsHeaders(res: Response, originHeader: string | null, allowedOrigin: string | null) {
  const headerOrigin = allowedOrigin ?? (!originHeader ? PRIMARY_CORS_ORIGIN : null);
  if (headerOrigin) {
    res.setHeader("Access-Control-Allow-Origin", headerOrigin);
  } else {
    res.removeHeader("Access-Control-Allow-Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Expose-Headers", ASK_ECO_EXPOSE_HEADERS_VALUE);
  res.setHeader("Access-Control-Allow-Headers", ASK_ECO_ALLOWED_HEADERS_VALUE);
  res.setHeader("Access-Control-Allow-Methods", ASK_ECO_ALLOWED_METHODS_VALUE);
  ensureVaryIncludes(res, "Origin");
}

function captureShortStack(label: string): string | null {
  const err = new Error(label);
  if (!err.stack) return null;
  return (
    err.stack
      .split("\n")
      .slice(1, 6)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" | ") || null
  );
}

function extractSessionIdLoose(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const candidates = [
    (source as any).sessionId,
    (source as any).session_id,
    (source as any).sessionID,
    (source as any).sessaoId,
    (source as any).sessao_id,
    (source as any).sessaoID,
    (source as any).session,
    (source as any).sessao,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

// === Routes ===

/** GET /api/prompt-preview */
router.get("/prompt-preview", async (req: Request, res: Response) => {
  try {
    await getPromptEcoPreview(req, res);
  } catch (error) {
    console.error("Erro no handler de rota /prompt-preview:", error);
    if (!res.headersSent) res.status(500).json({ error: "Erro interno ao montar o prompt." });
  }
});

askEcoRouter.get("/", ensureIdentity, handleAskEcoRequest);
askEcoRouter.post("/", ensureIdentity, handleAskEcoRequest);

askEcoRouter.options("/", (req: Request, res: Response) => {
  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : null;
  const allowedOrigin = resolveCorsOrigin(originHeader);

  if (originHeader && !allowedOrigin) {
    log.warn("[ask-eco] origin_blocked", { method: "OPTIONS", origin: originHeader });
    ensureVaryIncludes(res, "Origin");
    res.status(403).end();
    return;
  }

  applyAskEcoCorsHeaders(res, originHeader, allowedOrigin);
  res.status(204).end();
});

// Aceita headers: X-Eco-Guest-Id, X-Eco-Session-Id
// Aceita query: ?guest_id=...&session_id=...
askEcoRouter.head("/", ensureIdentity, (_req: Request, res: Response) => {
  res.status(200).end();
});

/** GET/POST /api/ask-eco — stream SSE (ou JSON se cliente não pedir SSE) */
async function handleAskEcoRequest(req: Request, res: Response, _next: NextFunction) {
  const reqWithIdentity = req as RequestWithIdentity;
  log.info("[ask-eco] identity_resolved", {
    guestId: reqWithIdentity.guestId,
    sessionId: reqWithIdentity.ecoSessionId ?? null,
    clientMessageId: reqWithIdentity.clientMessageId ?? null,
  });

  const method = req.method.toUpperCase();
  const rawBody = method === "GET" ? buildAskEcoQueryPayload(req) : (req.body as any);
  const accept = String(req.headers.accept || "").toLowerCase();

  const streamParam = (() => {
    const fromQuery = (req.query as any)?.stream;
    if (typeof fromQuery === "string") return fromQuery;
    if (Array.isArray(fromQuery)) return fromQuery[fromQuery.length - 1];
    const bodyValue = (rawBody as any)?.stream;
    if (typeof bodyValue === "string") return bodyValue;
    if (typeof bodyValue === "boolean") return bodyValue ? "true" : "false";
    return undefined;
  })();

  const wantsStreamByFlag = typeof streamParam === "string" && /^(1|true|yes)$/i.test(streamParam.trim());
  const wantsStream = method === "GET" ? true : wantsStreamByFlag || accept.includes("text/event-stream");

  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : null;
  const resolvedAllowedOrigin = resolveCorsOrigin(originHeader);
  const allowedOrigin = Boolean(resolvedAllowedOrigin);
  const origin = originHeader ?? undefined;
  const normalizedOriginHeader = allowedOrigin && originHeader ? originHeader : undefined;

  applyAskEcoCorsHeaders(res, originHeader, resolvedAllowedOrigin);

  const streamIdHeader = req.headers["x-stream-id"];
  const incomingStreamId = typeof streamIdHeader === "string" && streamIdHeader.trim() ? streamIdHeader.trim() : undefined;
  const generatedStreamId = randomUUID();
  const streamId = incomingStreamId ?? generatedStreamId;

  const idleTimeoutMs = streamIdleTimeoutMs;
  const pingIntervalMs = streamPingIntervalMs;
  const firstTokenTimeoutMs = firstTokenWatchdogMs;

  let sse: ReturnType<typeof createSSE> | null = null;
  let sseConnection: ReturnType<typeof createSSE> | null = null;
  let sseStarted = false;
  let sseWarmupStarted = false;
  let sseSendErrorEvent: ((payload: Record<string, unknown>) => void) | null = null;
  let sseSendDone: ((reason?: string | null) => void) | null = null;
  let sseSafeEarlyWrite: ((chunk: string) => boolean) | null = null;
  let supabaseContextUnavailable = false;

  const warmupSse = () => {
    if (!wantsStream || sseWarmupStarted) return;
    sseWarmupStarted = true;
    disableCompressionForSse(res);
    ensureVaryIncludes(res, "Origin");
    if (reqWithIdentity.guestId) res.setHeader("X-Eco-Guest-Id", reqWithIdentity.guestId);
    if (reqWithIdentity.ecoSessionId) res.setHeader("X-Eco-Session-Id", reqWithIdentity.ecoSessionId);
    if (!res.headersSent) res.setHeader("X-Stream-Id", streamId);
    const targetOrigin = resolvedAllowedOrigin ?? originHeader ?? null;
    prepareSse(res, targetOrigin);
    try {
      res.write("\n");
      res.write(":ok\n\n");
      (res as any).__ecoSseWarmupSent = true;
      (res as any).flushHeaders?.();
      (res as any).flush?.();
    } catch (error) {
      log.warn("[ask-eco] sse_warmup_failed", {
        origin: origin ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (wantsStream && !allowedOrigin) {
    log.warn("[ask-eco] origin_blocked", { origin: origin ?? null, method: req.method });
    res.status(403).end();
    return;
  }

  warmupSse();

  const validation = validateAskEcoPayload(rawBody, req.headers);
  if (isValidationFailure(validation)) {
    const { status, message } = validation.error;
    if (wantsStream) {
      try {
        const fallbackSse = createSSE(res, req, { pingIntervalMs: 0, idleMs: 0, commentOnOpen: null });
        sse = fallbackSse;
        sseStarted = true;
        fallbackSse.send("chunk", { error: true, message: INVALID_INPUT_MESSAGE });
        fallbackSse.send("done", { ok: false, reason: "invalid_input" });
        fallbackSse.end();
      } catch (error) {
        log.warn("[ask-eco] sse_validation_fallback_failed", {
          origin: origin ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    res.status(status).json({ ok: false, error: message });
    return;
  }

  const { body, normalized, payloadShape, clientMessageId, activeClientMessageId, sessionMetaObject } = validation.data;

  const promptReadyClientMessageId = typeof clientMessageId === "string" && clientMessageId.trim() ? clientMessageId.trim() : randomUUID();

  (res.locals as Record<string, unknown>).corsAllowed = allowedOrigin;
  (res.locals as Record<string, unknown>).corsOrigin = origin ?? null;
  (res.locals as Record<string, unknown>).isSse = wantsStream;

  const guestIdFromSession: string | undefined = (req as any)?.guest?.id || undefined;
  const guestIdFromRequest = typeof reqWithIdentity.guestId === "string" ? reqWithIdentity.guestId : undefined;
  const guestIdFromHeader = req.get("X-Eco-Guest-Id")?.trim();
  const guestIdFromCookie = getGuestIdFromCookies(req);

  const { nome_usuario, usuario_id, clientHour, isGuest, guestId: guestIdFromBody } = body as any;
  const isGuestRequest = Boolean(isGuest);

  // Garantia de não duplicação para a mesma mensagem do cliente
  if (activeClientMessageLocks.has(activeClientMessageId)) {
    log.warn("[ask-eco] duplicate_client_message_active", { clientMessageId: activeClientMessageId });
    res.status(409).json({ ok: false, error: "duplicate message (already processing)", code: "CLIENT_MESSAGE_ACTIVE" });
    return;
  }

  activeClientMessageLocks.set(activeClientMessageId, true);
  let clientMessageLockActive = true;
  const finalizeClientMessageLock = () => {
    if (!clientMessageLockActive) return;
    clientMessageLockActive = false;
    activeClientMessageLocks.delete(activeClientMessageId);
  };

  let clientMessageKey: string | null = null;
  let clientMessageReserved = false;
  let doneSent = false;

  const guestIdResolved = resolveGuestId(
    typeof (guestIdFromBody as any) === "string" ? (guestIdFromBody as string) : undefined,
    guestIdFromHeader,
    guestIdFromCookie,
    guestIdFromRequest,
    guestIdFromSession
  );

  log.info("[ask-eco] payload_valid", {
    guestId: reqWithIdentity.guestId ?? null,
    sessionId: reqWithIdentity.ecoSessionId ?? null,
  });

  const identityKey =
    ((typeof reqWithIdentity.user?.id === "string" && reqWithIdentity.user.id.trim()) ? reqWithIdentity.user.id.trim() : null) ??
    ((typeof reqWithIdentity.guestId === "string" && reqWithIdentity.guestId.trim()) ? reqWithIdentity.guestId.trim() : null);

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
    if (!normalized.messages.length) throw createHttpError(400, "BAD_REQUEST", "Payload inválido (text/mensagem/mensagens)");

    const hasUserMessage = normalized.messages.some(
      (msg) => msg.role === "user" && typeof msg.content === "string" && msg.content.trim()
    );
    if (!hasUserMessage) throw createHttpError(400, "BAD_REQUEST", "Inclua ao menos uma mensagem de usuário válida");

    if (REQUIRE_GUEST_ID && !hasGuestId) throw createHttpError(400, "MISSING_GUEST_ID", "Informe X-Eco-Guest-Id");

    if (clientMessageId) {
      const dedupeIdentity =
        identityKey ??
        (typeof (usuario_id as any) === "string" && (usuario_id as string).trim() ? (usuario_id as string).trim() : null) ??
        guestIdResolved ??
        (typeof reqWithIdentity.ecoSessionId === "string" && reqWithIdentity.ecoSessionId.trim() ? reqWithIdentity.ecoSessionId.trim() : null);

      clientMessageKey = buildClientMessageKey(dedupeIdentity ?? null, clientMessageId);
      const reservation = reserveClientMessage(clientMessageKey);
      if (reservation.ok === false) {
        const duplicateStatus = reservation.status;
        log.warn("[ask-eco] duplicate_client_message", { clientMessageId, status: duplicateStatus, identity: dedupeIdentity ?? null });
        res.status(409).json({ ok: false, code: "DUPLICATE_CLIENT_MESSAGE", error: "Interação já processada", status: duplicateStatus });
        return;
      }
      clientMessageReserved = true;
    }

    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;

    const params: Record<string, unknown> = {
      messages: normalized.messages,
      isGuest: isGuestRequest,
      authUid: authUid ?? null,
    };

    if (typeof bearer === "string" && bearer.trim()) (params as any).accessToken = bearer.trim();
    if (typeof clientHour === "number" && Number.isFinite(clientHour)) (params as any).clientHour = clientHour;
    if (sessionMetaObject) (params as any).sessionMeta = sessionMetaObject;
    if (typeof nome_usuario === "string" && nome_usuario.trim()) (params as any).userName = nome_usuario.trim();
    if (typeof usuario_id === "string" && usuario_id.trim()) (params as any).userId = usuario_id.trim();
    if (typeof reqWithIdentity.guestId === "string" && reqWithIdentity.guestId.trim()) (params as any).guestId = reqWithIdentity.guestId.trim();
    else if (guestIdResolved) (params as any).guestId = guestIdResolved;

    if (identityKey && typeof (params as any).distinctId !== "string") (params as any).distinctId = identityKey;
    if (identityKey && typeof (params as any).userId !== "string") (params as any).userId = identityKey;

    // JSON mode
    if (!wantsStream) {
      try {
        const result = await getEcoResponse(params as any);
        const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
        log.info("[ask-eco] response", { mode: "json", hasContent: textOut.length > 0 });

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
            usageSource?.prompt_tokens ?? usageSource?.input_tokens ?? usageSource?.tokens_in ?? usageSource?.in ?? (result as any)?.prompt_tokens ?? (result as any)?.input_tokens ?? null;
          const outValue =
            usageSource?.completion_tokens ?? usageSource?.output_tokens ?? usageSource?.tokens_out ?? usageSource?.out ?? (result as any)?.completion_tokens ?? (result as any)?.output_tokens ?? null;
          return {
            in: typeof inValue === "number" && Number.isFinite(inValue) ? Number(inValue) : null,
            out: typeof outValue === "number" && Number.isFinite(outValue) ? Number(outValue) : null,
          };
        })();

        const resultMeta = (result as any)?.meta;
        const metaPayload = resultMeta && typeof resultMeta === "object" ? { ...(resultMeta as Record<string, unknown>) } : null;
        const rawTimings = (result as any)?.timings;
        const timingsPayload = rawTimings && typeof rawTimings === "object" ? { ...(rawTimings as Record<string, unknown>) } : null;

        const donePayload = buildDonePayload({
          content: textOut || null,
          interactionId: typeof (resultMeta as any)?.interaction_id === "string" ? (resultMeta as any).interaction_id : null,
          tokens,
          meta: metaPayload,
          timings: timingsPayload,
        });

        if (clientMessageReserved && clientMessageKey) {
          markClientMessageCompleted(clientMessageKey);
          clientMessageReserved = false;
        }

        res.status(200).json(donePayload);
        return;
      } catch (error) {
        if (clientMessageReserved && clientMessageKey) {
          releaseClientMessage(clientMessageKey);
          clientMessageReserved = false;
        }
        if (isHttpError(error)) {
          log.warn("[ask-eco] json_error", { code: (error as any).body?.code, status: (error as any).status });
          res.status((error as any).status).json((error as any).body);
          return;
        }
        const traceId = randomUUID();
        log.error("[ask-eco] json_unexpected", { trace_id: traceId, message: (error as Error)?.message });
        res.status(500).json({ code: "INTERNAL_ERROR", trace_id: traceId });
        return;
      }
    }

    // SSE mode
    const lastMessageId = req.get("Last-Event-ID") ?? req.header("Last-Event-ID") ?? undefined;

    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    const activeInteractionKeys = new Set<string>();

    const registerActiveInteractionKey = (key: string | null | undefined): boolean => {
      if (!key) return true;
      const trimmed = key.trim();
      if (!trimmed) return true;
      const ok = reserveActiveInteraction(trimmed, abortController);
      if (ok) activeInteractionKeys.add(trimmed);
      return ok;
    };

    const releaseActiveInteractionKeys = () => {
      if (!activeInteractionKeys.size) return;
      for (const key of activeInteractionKeys) releaseActiveInteraction(key, abortController);
      activeInteractionKeys.clear();
    };

    const streamContextKey = (() => {
      if (typeof streamId === "string" && streamId.trim()) return `stream:${streamId.trim()}`;
      if (typeof reqWithIdentity.ecoSessionId === "string" && reqWithIdentity.ecoSessionId.trim()) return `session:${reqWithIdentity.ecoSessionId.trim()}`;
      return null;
    })();

    const releaseActiveStream = () => {
      releaseActiveInteractionKeys();
      if (!streamContextKey) return;
      const current = activeStreamSessions.get(streamContextKey);
      if (current && current.controller === abortController) activeStreamSessions.delete(streamContextKey);
    };

    if (streamContextKey) {
      const existing = activeStreamSessions.get(streamContextKey);
      if (existing) {
        try {
          existing.controller.abort(new Error("replaced_by_new_stream"));
        } catch (error) {
          log.warn("[ask-eco] prior_stream_abort_failed", { message: error instanceof Error ? error.message : String(error) });
        }
      }
      activeStreamSessions.set(streamContextKey, { controller: abortController, interactionId: "" });
    }

    // Telemetry client (Supabase)
    const telemetryClient = (() => {
      const client = getSupabaseAdmin();
      if (!client) {
        supabaseContextUnavailable = true;
        return null;
      }
      try {
        return client.schema("analytics");
      } catch {
        supabaseContextUnavailable = true;
        return null;
      }
    })();

    const telemetry = new SseTelemetry(telemetryClient, { origin: origin ?? undefined, clientMessageId: clientMessageId ?? undefined });

    const fallbackInteractionId = randomUUID();
    (params as any).interactionId = fallbackInteractionId;
    (params as any).abortSignal = abortSignal;

    registerActiveInteractionKey(buildActiveInteractionKey("interaction", fallbackInteractionId));
    telemetry.setFallbackInteractionId(fallbackInteractionId);

    const getResolvedInteractionId = createGetResolvedInteractionId(telemetry);
    const isInteractionIdReady = () => telemetry.isInteractionIdReady();

    const finalizeClientMessageReservation = (finishReason?: string | null) => {
      if (!clientMessageReserved || !clientMessageKey) return;
      const reason = typeof finishReason === "string" ? finishReason.toLowerCase() : "";
      const isFailure =
        reason.includes("error") ||
        reason === "timeout" ||
        reason === "aborted" ||
        reason === "client_closed" ||
        reason === "superseded_stream";
      if (isFailure) releaseClientMessage(clientMessageKey);
      else markClientMessageCompleted(clientMessageKey);
      clientMessageReserved = false;
    };

    const updateActiveStreamInteractionId = (interactionId: string) => {
      if (!streamContextKey) return;
      const current = activeStreamSessions.get(streamContextKey);
      if (current && current.controller === abortController) {
        activeStreamSessions.set(streamContextKey, { controller: abortController, interactionId });
      }
    };

    const captureInteractionId = (value: unknown) => {
      const result = telemetry.captureInteractionId(value);
      if (!result) return;
      const { interactionId, alreadyReady } = result;
      if (!interactionId) return;
      if (alreadyReady) {
        updateInteractionGuest(interactionId, guestIdResolved ?? null);
        return;
      }
      rememberInteractionGuest(interactionId, guestIdResolved ?? null);
      updateActiveStreamInteractionId(interactionId);
      const interactionKey = buildActiveInteractionKey("interaction", interactionId);
      if (!registerActiveInteractionKey(interactionKey)) {
        log.warn("[ask-eco] active_interaction_conflict", { interactionId, clientMessageId: clientMessageId ?? null, origin: origin ?? null });
      }
    };

    const enqueuePassiveSignal = (signal: string, value?: number | null, meta?: Record<string, unknown>) => {
      telemetry.enqueuePassiveSignal(signal, value ?? null, meta);
    };

    const compactMeta = (meta: Record<string, unknown>): Record<string, unknown> => telemetry.compactMeta(meta);

    const normalizedOrigin = normalizedOriginHeader;

    res.socket?.setTimeout(300000);
    res.socket?.setKeepAlive(true, 30000);

    const initialResolvedInteractionId = getResolvedInteractionId();
    if (typeof initialResolvedInteractionId === "string" && initialResolvedInteractionId && !res.headersSent) {
      res.setHeader("X-Eco-Interaction-Id", initialResolvedInteractionId);
    }

    if (!res.headersSent) {
      res.setHeader("X-Stream-Id", streamId);
      disableCompressionForSse(res);
      log.debug("[DEBUG] About to set SSE headers", { origin: origin ?? null, streamId: streamId ?? null, clientMessageId: clientMessageId ?? null });
      const targetOrigin = resolvedAllowedOrigin ?? originHeader ?? null;
      prepareSse(res, targetOrigin);
      log.debug("[DEBUG] SSE headers set", { origin: origin ?? null, streamId: streamId ?? null, clientMessageId: clientMessageId ?? null });
      (res as any).flushHeaders?.();
    }
    sseStarted = true;

    const flushSse = () => {
      (res as any).flushHeaders?.();
      (res as any).flush?.();
    };

    const safeEarlyWrite = (chunk: string): boolean => {
      const resAny = res as any;
      if (resAny.writableEnded || resAny.writableFinished || resAny.destroyed) return false;
      try {
        res.write(chunk);
        flushSse();
        return true;
      } catch (error) {
        log.warn("[ask-eco] sse_early_write_failed", { message: error instanceof Error ? error.message : String(error) });
        return false;
      }
    };

    sseSafeEarlyWrite = safeEarlyWrite;
    safeEarlyWrite(": open\n\n");

    log.info("[ask-eco] stream_open", { origin: origin ?? null, clientMessageId: clientMessageId ?? null, streamId: streamId ?? null });

    const formatHeaderValue = (value: string | number | string[] | boolean | null | undefined): string | null => {
      if (Array.isArray(value)) return value.map((entry) => (typeof entry === "string" || typeof entry === "number" ? String(entry) : "")).filter(Boolean).join(", ");
      if (typeof value === "number") return String(value);
      if (typeof value === "boolean") return value ? "true" : "false";
      if (typeof value === "string") return value;
      return value ?? null;
    };

    const headerSnapshot = {
      "content-type": formatHeaderValue(res.getHeader("Content-Type")),
      "cache-control": formatHeaderValue(res.getHeader("Cache-Control")),
      connection: formatHeaderValue(res.getHeader("Connection")),
      "x-accel-buffering": formatHeaderValue(res.getHeader("X-Accel-Buffering")),
      "x-no-compression": formatHeaderValue(res.getHeader("X-No-Compression")),
      "transfer-encoding": formatHeaderValue(res.getHeader("Transfer-Encoding")),
    } as const;

    log.info("[ask-eco] stream_start", {
      origin: origin ?? null,
      streamId: streamId ?? null,
      clientMessageId: clientMessageId ?? null,
      interactionId: getResolvedInteractionId() ?? null,
      headers: {
        accept: typeof req.headers.accept === "string" ? req.headers.accept : undefined,
        "user-agent": typeof req.headers["user-agent"] === "string" ? (req.headers["user-agent"] as string) : undefined,
      },
      pid: process.pid,
      idleTimeoutMs,
      pingIntervalMs,
      firstTokenTimeoutMs,
      responseHeaders: headerSnapshot,
    });

    const state = new SseStreamState();

    const earlyClientAbortTimerRef: { current: NodeJS.Timeout | null } = { current: null };
    let immediatePromptReadySent = false;
    let interactionBootstrapPromise: Promise<void> = Promise.resolve();

    const classifyClose = (source: string | null | undefined) => state.classifyClose(source);

    const markConnectionClosed = (
      source: string,
      error?: unknown
    ): "client_closed" | "proxy_closed" | "server_abort" | "unknown" => {
      const effectiveClassification = state.markConnectionClosed(source, error, captureShortStack);

      if (!state.done) {
        const sincePromptReady = state.promptReadyAt > 0 ? state.closeAt - state.promptReadyAt : null;
        log.warn("[ask-eco] stream_close_before_done", {
          source,
          classification: effectiveClassification,
          beforeDone: true,
          chunksEmitted: state.chunksCount,
          bytesSent: state.bytesCount,
          sincePromptReadyMs: sincePromptReady,
          origin: origin ?? null,
          clientMessageId: clientMessageId ?? null,
          streamId: streamId ?? null,
          stack: effectiveClassification === "client_closed" ? state.clientClosedStack ?? undefined : undefined,
          closeError: state.closeErrorMessage ?? undefined,
          error: error instanceof Error ? error.message : error ? String(error) : undefined,
        });
      }

      return effectiveClassification;
    };

    const clearFirstTokenWatchdog = () => {
      state.clearFirstTokenWatchdogTimer();
    };

    const armFirstTokenWatchdog = () => {
      clearFirstTokenWatchdog();
      if (firstTokenWatchdogMs <= 0) return;
      const timer = setTimeout(() => {
        state.markFirstTokenWatchdogCleared();
        if (state.done || state.firstTokenWatchdogFired) return;
        state.markFirstTokenWatchdogFired();
        const nowTs = Date.now();
        log.warn("[ask-eco] first_token_watchdog_triggered", { timeoutMs: firstTokenWatchdogMs, origin: origin ?? null, clientMessageId: clientMessageId ?? null });
        enqueuePassiveSignal("first_token_watchdog", 0, { timeout_ms: firstTokenWatchdogMs });
        if (!state.sawChunk && !state.done) state.ensureFinishReason("first_token_timeout");
        state.updateLastEvent(nowTs);
      }, firstTokenWatchdogMs);
      state.setFirstTokenWatchdogTimer(timer);
    };

    let isClosed = false;
    const abortListenerRef: { current: (() => void) | null } = { current: null };
    const heartbeatRef: { current: NodeJS.Timeout | null } = { current: null };
    let handlers: SseEventHandlers;

    const sseConnectionRef: { current: ReturnType<typeof createSSE> | null } = { current: sseConnection };
    const getSseConnection = createGetSseConnectionRef(sseConnectionRef);
    const recordFirstTokenTelemetry = createRecordFirstTokenTelemetry(state, telemetry);
    const clearHeartbeatTimer = createClearHeartbeatTimer(heartbeatRef);
    const clearEarlyClientAbortTimer = createClearEarlyClientAbortTimer(earlyClientAbortTimerRef);
    const clearAbortListenerRef = createClearAbortListenerRef(abortSignal, abortListenerRef);

    function sendLatency(_payload: Record<string, unknown>) {
      // no-op (can be wired to analytics in the future)
    }

    const streamSse = createSSE(res, req, {
      pingIntervalMs: 0,
      idleMs: idleTimeoutMs,
      onIdle: () => handlers.handleStreamTimeout(),
      onConnectionClose: ({ source, error }: { source: string; error?: unknown }) => {
        isClosed = true;
        const classification = markConnectionClosed(source, error);
        if (!state.finishReason) {
          if (classification === "client_closed") state.setFinishReason("client_closed");
          else if (classification === "proxy_closed") state.setFinishReason("proxy_closed");
          else if (classification === "server_abort" && state.serverAbortReason) state.setFinishReason(state.serverAbortReason);
        }
        if (!state.done && !abortSignal.aborted) {
          if (classification === "client_closed") {
            if (!doneSent && !state.clientClosed) {
              const usageMeta = { input_tokens: state.usageTokens.in, output_tokens: state.usageTokens.out };
              const finalMeta = { ...state.doneMeta, finishReason: "client_disconnect", usage: usageMeta };
              state.setDoneMeta(finalMeta);
              state.ensureFinishReason("client_disconnect");
              doneSent = true;
            }
            if (!state.clientClosed) sseConnection?.sendComment?.("");
            if (!state.sawChunk) {
              if (!earlyClientAbortTimerRef.current) {
                log.info("[ask-eco] client closed before first chunk — keeping LLM alive brevemente", { origin: origin ?? null, clientMessageId: clientMessageId ?? null, streamId: streamId ?? null });
                earlyClientAbortTimerRef.current = setTimeout(() => {
                  earlyClientAbortTimerRef.current = null;
                  if (!state.sawChunk && !abortSignal.aborted) {
                    state.setFinishReason("client_closed_early");
                    abortController.abort(new Error("client_closed_early"));
                  }
                }, 1500);
              }
              state.setFinishReason("client_closed_early");
              return;
            }
            abortController.abort(new Error("client_closed"));
          } else if (classification === "proxy_closed") {
            abortController.abort(new Error("proxy_closed"));
          } else if (classification === "server_abort" && state.serverAbortReason) {
            abortController.abort(new Error(state.serverAbortReason));
          }
        }
      },
      commentOnOpen: null,
    });

    sse = streamSse;
    sseConnection = streamSse;
    sseConnectionRef.current = streamSse;

    const handlerResult = makeHandlers({
      state,
      sse: streamSse,
      context: { origin: origin ?? null, clientMessageId: clientMessageId ?? null, streamId: streamId ?? null },
      onTelemetry: enqueuePassiveSignal,
      guardFallbackText: GUARD_FALLBACK_TEXT,
      idleTimeoutMs,
      getDoneSent: () => doneSent,
      setDoneSent: (value: boolean) => {
        doneSent = value;
      },
      clearHeartbeat: clearHeartbeatTimer,
      clearEarlyClientAbortTimer,
      getIsClosed: () => isClosed,
      clearFirstTokenWatchdog,
      recordFirstTokenTelemetry,
      updateUsageTokens: (meta) => state.updateUsageTokens(meta),
      mergeLatencyMarks: (marks) => state.mergeLatencyMarks(marks ?? {}),
      buildSummaryFromChunks,
      buildDonePayload,
      finalizeClientMessageReservation,
      getResolvedInteractionId,
      isInteractionIdReady,
      captureInteractionId,
      getInteractionBootstrapPromise: () => interactionBootstrapPromise,
      sendLatency,
      consoleStreamEnd: (payload) => {
        if (state.endLogged) return;
        state.markEndLogged();
        console.info("[ask-eco] end", { origin: origin ?? null, streamId: streamId ?? null, ...(payload ?? {}) });
      },
      compactMeta,
      abortSignal,
      clearAbortListener: clearAbortListenerRef,
      releaseActiveStream,
      onStreamEnd: () => {
        sseConnection = null;
        sseConnectionRef.current = null;
      },
      getSseConnection,
      armFirstTokenWatchdog,
      streamHasChunkHandler: true,
      getRequestAborted: () => req.aborted === true,
    });

    handlers = handlerResult.handlers;

    const sendMeta = handlerResult.sendMeta;
    const sendMemorySaved = handlerResult.sendMemorySaved; // (mantido para compatibilidade)
    const sendErrorEvent = handlerResult.sendErrorEvent;
    const ensureGuardFallback = handlerResult.ensureGuardFallback;
    const sendDone = handlerResult.sendDone;
    const sendChunk = handlerResult.sendChunk;
    const forwardEvent = handlerResult.forwardEvent;

    if (supabaseContextUnavailable && wantsStream) {
      streamSse.send("chunk", { warn: true, message: "Contexto indisponível (Supabase). Seguindo sem memórias." });
      flushSse();
    }

    sseSendErrorEvent = sendErrorEvent;
    sseSendDone = sendDone;

    const startHeartbeat = () => {
      if (heartbeatRef.current || pingIntervalMs <= 0) return;
      const sendHeartbeat = () => {
        if (state.done || isClosed) {
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
          }
          return;
        }
        const now = Date.now();
        const sincePromptReadyMs = state.promptReadyAt > 0 ? now - state.promptReadyAt : null;
        log.debug("[ask-eco] heartbeat", { origin: origin ?? null, clientMessageId: clientMessageId ?? null, streamId: streamId ?? null, sincePromptReadyMs });
        if (sseConnection) {
          sseConnection.sendComment("keep-alive");
          flushSse();
        } else {
          safeEarlyWrite(":keep-alive\n\n");
        }
      };
      heartbeatRef.current = setInterval(sendHeartbeat, pingIntervalMs);
    };

    const sendImmediatePromptReady = () => {
      if (immediatePromptReadySent) return;
      immediatePromptReadySent = true;
      const nowTs = Date.now();
      const sinceStartMs = nowTs - state.t0;
      streamSse.send("control", {
        name: "prompt_ready",
        type: "prompt_ready",
        streamId,
        at: nowTs,
        sinceStartMs,
        client_message_id: promptReadyClientMessageId,
      });
      flushSse();
      state.markPromptReady(nowTs);
      armFirstTokenWatchdog();
      startHeartbeat();
      log.info("[ask-eco] prompt_ready_sent", { origin: origin ?? null, clientMessageId: clientMessageId ?? null, streamId: streamId ?? null });
    };

    sendImmediatePromptReady();

    req.on("close", () => {
      isClosed = true;
    });
    req.on("aborted", () => {
      isClosed = true;
    });
    (res as any).on?.("close", () => {
      isClosed = true;
    });

    const bootstrapInteraction = async () => {
      try {
        const interactionId = await createInteraction({
          userId: !isGuestRequest && typeof (params as any).userId === "string" ? ((params as any).userId as string).trim() : null,
          sessionId: typeof reqWithIdentity.ecoSessionId === "string" && reqWithIdentity.ecoSessionId.trim() ? reqWithIdentity.ecoSessionId.trim() : null,
          messageId: lastMessageId,
          promptHash: null,
        });

        if (interactionId && typeof interactionId === "string") {
          captureInteractionId(interactionId);
          (params as any).interactionId = interactionId;
          return;
        }
      } catch (error) {
        log.warn("[ask-eco] interaction_create_failed", { message: error instanceof Error ? error.message : String(error) });
      }

      if (!isInteractionIdReady()) captureInteractionId(getResolvedInteractionId());
    };

    abortListenerRef.current = () => {
      if (state.done) {
        clearAbortListenerRef();
        releaseActiveStream();
        return;
      }
      clearFirstTokenWatchdog();
      clearEarlyClientAbortTimer();
      clearHeartbeatTimer();
      const reasonValue = (abortSignal as any).reason;
      let finishReason = (() => {
        if (typeof reasonValue === "string" && reasonValue.trim()) return reasonValue.trim();
        if (reasonValue instanceof Error) return reasonValue.message?.trim() || reasonValue.name || "aborted";
        return "aborted";
      })();
      if (finishReason === "superseded_stream") finishReason = "replaced_by_new_stream";
      state.setServerAbortReason(finishReason);
      if (!state.connectionClosed) markConnectionClosed("server.abort");
      if (finishReason === "client_closed") {
        log.info("[ask-eco] sse_client_closed", { origin: origin ?? null, streamId: streamId ?? null, clientMessageId: clientMessageId ?? null, chunks: state.chunksCount, stack: state.clientClosedStack ?? undefined });
      } else if (finishReason === "replaced_by_new_stream") {
        log.info("[ask-eco] sse_stream_replaced", { origin: origin ?? null, streamId: streamId ?? null });
      } else if (finishReason === "proxy_closed") {
        log.info("[ask-eco] sse_proxy_closed", { origin: origin ?? null, streamId: streamId ?? null, clientMessageId: clientMessageId ?? null, closeError: state.closeErrorMessage ?? undefined });
      }
      state.markClientClosedFromFinishReason(finishReason);
      sendDone(finishReason || "aborted");
    };
    abortSignal.addEventListener("abort", abortListenerRef.current);

    interactionBootstrapPromise = bootstrapInteraction();

    try {
      const stream: EcoStreamHandler = {
        onEvent: (event) => forwardEvent(event),
        onChunk: async (payload) => {
          if (!payload) return;
          const metaValue = payload.meta && typeof payload.meta === "object" ? (payload.meta as Record<string, unknown>) : undefined;

          if ((payload as any).done) {
            if (metaValue) {
              state.mergeDoneMeta(metaValue);
              if (!state.finishReason) {
                const finishFromMeta = (() => {
                  if (typeof (metaValue as any).finishReason === "string") return (metaValue as any).finishReason as string;
                  if (typeof (metaValue as any).reason === "string") return (metaValue as any).reason as string;
                  if (typeof (metaValue as any).error === "string") return (metaValue as any).error as string;
                  return undefined;
                })();
                if (finishFromMeta) state.setFinishReason(finishFromMeta);
              }
            }
            return;
          }

          if (typeof (payload as any).text === "string" && (payload as any).text) {
            sendChunk({ text: (payload as any).text, index: (payload as any).index, meta: metaValue });
            return;
          }

          if (metaValue) sendMeta(metaValue);
        },
      };

      const result = await getEcoResponse({ ...(params as any), stream } as any);

      if (result && typeof result === "object") {
        const maybeModel = typeof (result as any).modelo === "string" ? (result as any).modelo : typeof (result as any).model === "string" ? (result as any).model : undefined;
        if (maybeModel) state.setModel(maybeModel);
        state.setStreamResult(result as Record<string, unknown>);
        captureInteractionId((result as any)?.meta?.interaction_id);
        state.updateUsageTokens(result as any);
        state.updateUsageTokens((result as any)?.meta);
        if ((result as any)?.timings && typeof (result as any).timings === "object") state.mergeLatencyMarks((result as any).timings as Record<string, unknown>);
      }

      if (!state.done) {
        if (!state.sawChunk) {
          const textOut = sanitizeOutput(extractTextLoose(result) ?? "");
          if (textOut) sendChunk({ text: textOut });
          sendDone(textOut ? "fallback_no_stream" : "fallback_empty");
        } else {
          sendDone("stream_done");
        }
      }
    } catch (error) {
      if ((error as any)?.message === "client_closed_early") {
        state.markClientClosed();
        state.setFinishReason("client_closed_early");
        log.info("[ask-eco] stream_aborted", { origin: origin ?? null, reason: "client_closed_early", streamId: streamId ?? null });
        return;
      }
      if (abortSignal.aborted) {
        const reasonValue = (abortSignal as any).reason;
        const reasonMessage = (() => {
          if (typeof reasonValue === "string" && reasonValue.trim()) return reasonValue.trim();
          if (reasonValue instanceof Error) return reasonValue.message?.trim() || reasonValue.name || "aborted";
          return "aborted";
        })();
        log.info("[ask-eco] stream_aborted", { origin: origin ?? null, reason: reasonMessage, streamId: streamId ?? null });
        sendDone(reasonMessage || "aborted");
      } else if (isHttpError(error)) {
        sendErrorEvent({ ...(error as any).body, status: (error as any).status });
        streamSse.send("chunk", { error: true, message: "LLM indisponível. Tente novamente." });
        flushSse();
        sendDone("llm_unavailable");
      } else {
        const traceId = randomUUID();
        log.error("[ask-eco] sse_unexpected", { trace_id: traceId, message: (error as Error)?.message });
        sendErrorEvent({ code: "INTERNAL_ERROR", trace_id: traceId });
        streamSse.send("chunk", { error: true, message: "LLM indisponível. Tente novamente.", traceId });
        flushSse();
        sendDone("llm_unavailable");
      }
    } finally {
      if (clientMessageReserved && clientMessageKey) {
        releaseClientMessage(clientMessageKey);
        clientMessageReserved = false;
      }
      if (!state.done) {
        clearAbortListenerRef();
        releaseActiveStream();
        clearHeartbeatTimer();
        streamSse.end();
        sseConnection = null;
        sseConnectionRef.current = null;
        sseSendErrorEvent = null;
        sseSendDone = null;
        sseSafeEarlyWrite = null;
      }
      sse = null;
    }
  } catch (error) {
    finalizeClientMessageLock();
    // Garanta a liberação da reserva de mensagem do cliente em erros topo-de-pilha
    try {
      // Nada — proteção dupla no finally abaixo
    } catch {}

    const traceId = randomUUID();
    log.error("[ask-eco] handler_failed", { trace_id: traceId, sseStarted, message: error instanceof Error ? error.message : String(error) });

    if (!sseStarted && !sseWarmupStarted) {
      res.status(400).json({ error: "invalid_request", traceId, message: error instanceof Error ? error.message : String(error) });
      return;
    }

    try {
      if (!sse) {
        const fallbackSse = createSSE(res, req, { pingIntervalMs: 0, idleMs: 0, commentOnOpen: null });
        sse = fallbackSse;
        sseStarted = true;
      }
      sse?.send("error", { message: "internal_error", traceId });
    } catch (sendError) {
      log.warn("[ask-eco] sse_error_emit_failed", { trace_id: traceId, message: sendError instanceof Error ? sendError.message : String(sendError) });
    }
    try {
      sse?.end();
    } catch (endError) {
      log.warn("[ask-eco] sse_end_failed", { trace_id: traceId, message: endError instanceof Error ? endError.message : String(endError) });
    }

    sse = null;
    sseConnection = null;
    sseSendErrorEvent = null;
    sseSendDone = null;
    sseSafeEarlyWrite = null;
    return;
  } finally {
    finalizeClientMessageLock();
  }
}

router.use("/ask-eco", askEcoRouter);

export default router;
