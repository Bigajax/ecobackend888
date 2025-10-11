import crypto from "node:crypto";
import express, { type Request, type Response } from "express";

import {
  getEcoResponse,
  type EcoStreamHandler,
  type EcoLatencyMarks,
} from "../services/ConversationOrchestrator";
import { buildFinalizedStreamText } from "../services/conversation/responseMetadata";
import type { GetEcoResult } from "../utils";
import { extractSessionMeta } from "./sessionMeta";
import {
  trackEcoCache,
  trackMensagemRecebida,
  trackGuestMessage,
  trackGuestStart,
} from "../analytics/events/mixpanelEvents";
import { getEmbeddingCached } from "../adapters/EmbeddingAdapter";
import {
  guestSessionConfig,
  incrementGuestInteraction,
  type GuestSessionMeta,
} from "../core/http/middlewares/guestSession";

import { log } from "../services/promptContext/logger";
import { now } from "../utils";
import { RESPONSE_CACHE } from "../services/CacheService";
// import requireAdmin from "../mw/requireAdmin"; // ⚠️ não usar neste endpoint para permitir guest
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import {
  ActivationTracer,
  saveActivationTrace,
  getActivationTrace,
} from "../core/activationTracer";

const CACHE_TTL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const STREAM_TIMEOUT_GUARD_MS = 5_000;
const STREAM_TIMEOUT_MESSAGE =
  "Desculpe, não consegui enviar uma resposta a tempo. Pode tentar novamente em instantes?";

type CachedResponsePayload = {
  raw: string;
  meta?: Record<string, any> | null;
  modelo?: string | null;
  usage?: unknown;
  timings?: EcoLatencyMarks;
};

const buildResponseCacheKey = (userId: string, ultimaMsg: string) => {
  const hash = crypto.createHash("sha1").update(`${userId}:${ultimaMsg}`).digest("hex");
  return `resp:user:${userId}:${hash}`;
};

const router = express.Router();

const safeLog = (s: string) =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_GUEST_MESSAGE_LENGTH = parsePositiveInt(process.env.GUEST_MAX_MESSAGE_LENGTH, 2000);

const normalizeStreamParam = (value: unknown): string | boolean | undefined => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }
  return value as string | boolean | undefined;
};

const isStreamDisabled = (value: unknown): boolean => {
  const normalized = normalizeStreamParam(value);
  if (typeof normalized === "string") {
    const lowered = normalized.trim().toLowerCase();
    return lowered === "false" || lowered === "0" || lowered === "no" || lowered === "off";
  }
  if (typeof normalized === "boolean") {
    return normalized === false;
  }
  return false;
};

const isTruthyFlag = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "yes";
  }
  return false;
};

const stripHtml = (text: string): string => text.replace(/<[^>]*>/g, " ");
const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

const sanitizeGuestMessages = (
  messages: Array<{ role?: string; content?: any }>
): Array<{ role: string; content: any }> => {
  return messages.map((message) => {
    const role = typeof message?.role === "string" ? message.role : "";
    if (role !== "user") {
      return { ...message, role } as { role: string; content: any };
    }
    const rawContent =
      typeof message?.content === "string"
        ? message.content
        : message?.content != null
        ? String(message.content)
        : "";
    const withoutHtml = stripHtml(rawContent);
    const sanitized = normalizeWhitespace(withoutHtml);
    if (sanitized.length > MAX_GUEST_MESSAGE_LENGTH) {
      const error = new Error("Mensagem excede o limite permitido para convidados.");
      (error as any).status = 400;
      (error as any).code = "GUEST_MESSAGE_TOO_LONG";
      throw error;
    }
    return { ...message, role, content: sanitized } as { role: string; content: any };
  });
};

type GuestAwareRequest = Request & { guest?: GuestSessionMeta; userId?: string };

const getMensagemTipo = (
  mensagens: Array<{ role?: string }> | null | undefined
): "inicial" | "continuacao" => {
  if (!Array.isArray(mensagens) || mensagens.length === 0) return "inicial";
  if (mensagens.length === 1) return mensagens[0]?.role === "assistant" ? "continuacao" : "inicial";

  let previousUserMessages = 0;
  for (let i = 0; i < mensagens.length - 1; i += 1) {
    const role = mensagens[i]?.role;
    if (role === "assistant") return "continuacao";
    if (role === "user") previousUserMessages += 1;
  }
  return previousUserMessages > 0 ? "continuacao" : "inicial";
};

// 🔧 normalizador — agora aceita também { text: "..." }
function normalizarMensagens(body: any): Array<{ role: string; content: any }> | null {
  const { messages, mensagens, mensagem, text } = body || {};
  if (Array.isArray(messages)) return messages;
  if (Array.isArray(mensagens)) return mensagens;
  if (mensagem) return [{ role: "user", content: mensagem }];
  if (text) return [{ role: "user", content: text }];
  return null;
}

// ⚠️ NÃO usamos requireAdmin aqui para permitir chamadas guest (curl/Vercel)
router.post("/ask-eco", async (req: GuestAwareRequest, res: Response) => {
  const t0 = now();
  const promptReadyImmediate =
    req.body?.promptReadyImmediate === true ||
    req.body?.promptReadyImmediate === "true" ||
    req.body?.latency?.promptReadyImmediate === true ||
    req.body?.latency?.promptReadyImmediate === "true";

  const debugRequested =
    isTruthyFlag((req.query as any)?.debug) || isTruthyFlag((req.body as any)?.debug);
  const activationTracer = new ActivationTracer({ startedAt: t0 });
  res.setHeader("X-Eco-Trace-Id", activationTracer.traceId);

  let traceCommitted = false;
  const commitTrace = () => {
    if (traceCommitted) return;
    activationTracer.markTotal();
    saveActivationTrace(activationTracer.snapshot());
    traceCommitted = true;
  };

  res.on("finish", commitTrace);
  res.on("close", commitTrace);

  // ----------- DETECÇÃO ROBUSTA DE GUEST / USER -----------
  const headerGuestId =
    (req.headers["x-guest-id"] as string | undefined)?.trim() ||
    (req.headers["X-Guest-Id"] as string | undefined)?.trim();

  const bodyIsGuest = Boolean(req.body?.isGuest);
  const bodyGuestId = typeof req.body?.guestId === "string" ? req.body.guestId.trim() : "";

  const authHeader = req.headers.authorization;
  const hasBearer = typeof authHeader === "string" && /^Bearer\s+/i.test(authHeader?.trim() || "");
  const token = hasBearer ? authHeader!.trim().replace(/^Bearer\s+/i, "") : undefined;

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

  // ----------- INPUT BÁSICO -----------
  const { usuario_id: usuarioIdBody, nome_usuario } = req.body ?? {};
  const streamingRes = res as Response & { flush?: () => void; flushHeaders?: () => void };
  const rawStreamQuery = (req.query as any)?.stream;
  const rawStreamBody = (req.body as any)?.stream;
  const hasStreamPreference =
    typeof rawStreamQuery !== "undefined" || typeof rawStreamBody !== "undefined";
  const streamDisabled = isStreamDisabled(rawStreamQuery) || isStreamDisabled(rawStreamBody);
  const respondAsStream = !streamDisabled && (!isGuest ? true : hasStreamPreference);

  let sseStarted = false;
  let streamClosed = false;
  let sendSseRef: ((payload: Record<string, unknown>) => void) | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let timeoutGuard: NodeJS.Timeout | null = null;
  let endStreamRef: (() => void) | null = null;
  const offlineEvents: Array<Record<string, unknown>> = [];
  let aggregatedText = "";
  let chunkReceived = false;
  let lastChunkIndex = -1;
  let latestTimings: EcoLatencyMarks | undefined;
  let firstChunkLogged = false;
  let cacheKey: string | null = null;
  let cacheable = true;
  let cacheCandidateMeta: Record<string, any> | null = null;
  let cacheCandidateTimings: EcoLatencyMarks | undefined;
  let clientDisconnected = false;

  const mensagensBrutas = normalizarMensagens(req.body);
  if (!mensagensBrutas || mensagensBrutas.length === 0) {
    activationTracer.addError("validation", "messages são obrigatórios.");
    return res.status(200).json({
      ok: false,
      error: { message: "messages são obrigatórios.", statusCode: 400 },
      ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
    });
  }

  // Sanitização apenas no guest
  let mensagensParaIA = mensagensBrutas;
  if (isGuest) {
    try {
      mensagensParaIA = sanitizeGuestMessages(mensagensBrutas);
    } catch (sanitizationError: any) {
      const statusCode = Number.isInteger((sanitizationError as any)?.status)
        ? Number((sanitizationError as any).status)
        : 400;
      activationTracer.addError(
        "sanitize_guest_messages",
        sanitizationError?.message || "Entrada inválida para o modo convidado."
      );
      return res.status(200).json({
        ok: false,
        error: {
          message: sanitizationError?.message || "Entrada inválida para o modo convidado.",
          statusCode,
        },
        ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
      });
    }
  }

  // ----------- GUARD DE AUTENTICAÇÃO (apenas users) -----------
  if (!isGuest) {
    if (!hasBearer || !token) {
      activationTracer.addError("auth", "Token de acesso ausente.");
      return res.status(200).json({
        ok: false,
        error: { message: "Token de acesso ausente.", statusCode: 401 },
        ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
      });
    }
    if (!usuarioIdBody) {
      activationTracer.addError("auth", "usuario_id e messages são obrigatórios.");
      return res.status(200).json({
        ok: false,
        error: { message: "usuario_id e messages são obrigatórios.", statusCode: 400 },
        ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
      });
    }
  }

  const pipelineUserId = isGuest ? `guest:${guestId!}` : String(usuarioIdBody);
  if (!pipelineUserId) {
    activationTracer.addError("validation", "Usuário inválido.");
    return res.status(200).json({
      ok: false,
      error: { message: "Usuário inválido.", statusCode: 400 },
      ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
    });
  }
  activationTracer.setUserId(pipelineUserId);

  // ----------- SESSION META / ANALYTICS -----------
  let sessionMeta = extractSessionMeta(req.body);
  sessionMeta = sessionMeta ? { ...sessionMeta } : undefined;

  if (isGuest && guestId) {
    if (!sessionMeta) {
      sessionMeta = { distinctId: guestId };
    } else if (!sessionMeta.distinctId) {
      sessionMeta.distinctId = guestId;
    }
  }

  const distinctId = sessionMeta?.distinctId ?? (isGuest && guestId ? guestId : undefined);
  const analyticsUserId = isGuest ? undefined : usuarioIdBody;

  // ----------- RATE LIMIT DO GUEST -----------
  let guestInteractionCount: number | null = null;
  if (isGuest && guestId) {
    guestInteractionCount = incrementGuestInteraction(guestId);
    if (guestInteractionCount > guestSessionConfig.maxInteractions) {
      activationTracer.addError("rate_limit", "Limite de interações do modo convidado atingido.");
      return res.status(200).json({
        ok: false,
        error: {
          message: "Limite de interações do modo convidado atingido.",
          statusCode: 429,
        },
        ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
      });
    }
    if (req.guest) {
      req.guest.interactionsUsed = guestInteractionCount;
    }
  }

  try {
    // ----------- VALIDAÇÃO DO TOKEN QUANDO USER -----------
    if (!isGuest) {
      const supabaseClient = (req as any).supabaseAdmin ?? ensureSupabaseConfigured();
      const { data, error } = await supabaseClient.auth.getUser(token!);
      if (error || !data?.user) {
        activationTracer.addError("auth", "Token inválido ou usuário não encontrado.");
        return res.status(200).json({
          ok: false,
          error: { message: "Token inválido ou usuário não encontrado.", statusCode: 401 },
          ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
        });
      }
    }

    // ----------- SSE BOOTSTRAP -----------
    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const sendHeartbeat = () => {
      if (!respondAsStream || streamClosed || !sseStarted) return;
      streamingRes.write(`:keepalive\n\n`);
      streamingRes.flush?.();
    };

    const ensureHeartbeat = () => {
      if (!respondAsStream || heartbeatTimer || streamClosed) return;
      heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    };

    const clearTimeoutGuard = () => {
      if (timeoutGuard) {
        clearTimeout(timeoutGuard);
        timeoutGuard = null;
      }
    };

    let timeoutGuardHandler: (() => void) | null = null;

    const ensureTimeoutGuard = () => {
      if (!respondAsStream || timeoutGuard || streamClosed) return;
      timeoutGuard = setTimeout(() => {
        if (streamClosed || chunkReceived) return;
        timeoutGuardHandler?.();
      }, STREAM_TIMEOUT_GUARD_MS);
    };

    const startSse = () => {
      if (!respondAsStream || sseStarted) return;
      sseStarted = true;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      streamingRes.flushHeaders?.();
      streamingRes.flush?.();
      ensureHeartbeat();
      ensureTimeoutGuard();
    };

    const dispatchEvent = (payload: Record<string, unknown>) => {
      if (streamClosed) return;
      if (!respondAsStream) {
        offlineEvents.push(payload);
        return;
      }
      startSse();
      streamingRes.write(`data: ${JSON.stringify(payload)}\n\n`);
      streamingRes.flush?.();
    };
    sendSseRef = dispatchEvent;

    const endStream = () => {
      if (streamClosed) return;
      streamClosed = true;
      stopHeartbeat();
      clearTimeoutGuard();
      if (respondAsStream) {
        streamingRes.end();
      }
    };
    endStreamRef = endStream;

    const emitLatency = (
      stage: "prompt_ready" | "ttfb" | "ttlc",
      at: number,
      timings?: EcoLatencyMarks
    ) => {
      if (stage === "prompt_ready") activationTracer.markPromptReady(at);
      else if (stage === "ttfb") activationTracer.markFirstToken(at);
      else if (stage === "ttlc") activationTracer.markTotal(at);
      const sinceStartMs = at - t0;
      log.info(`// LATENCY: ${stage}`, { at, sinceStartMs, timings });
      dispatchEvent({ type: "latency", stage, at, sinceStartMs, timings });
    };

    const triggerTimeoutFallback = () => {
      if (!respondAsStream || streamClosed || chunkReceived) return;
      cacheable = false;
      chunkReceived = true;
      aggregatedText = STREAM_TIMEOUT_MESSAGE;
      lastChunkIndex = lastChunkIndex < 0 ? 0 : lastChunkIndex + 1;
      dispatchEvent({
        type: "chunk",
        delta: STREAM_TIMEOUT_MESSAGE,
        index: lastChunkIndex,
        fallback: true,
      });
      const at = now();
      emitLatency("ttlc", at, latestTimings);
      const donePayload: Record<string, unknown> = {
        type: "done",
        meta: { fallback: true, reason: "timeout" },
        at,
        sinceStartMs: at - t0,
        timings: latestTimings,
      };
      if (debugRequested) {
        donePayload.trace = activationTracer.snapshot();
      }
      dispatchEvent(donePayload);
      endStream();
    };

    timeoutGuardHandler = triggerTimeoutFallback;

    if (respondAsStream) {
      startSse();
    }

    if (promptReadyImmediate) {
      const at = now();
      emitLatency("prompt_ready", at);
      dispatchEvent({ type: "prompt_ready", at, sinceStartMs: at - t0 });
    }

    req.on("close", () => {
      if (!streamClosed) {
        clientDisconnected = true;
      }
      streamClosed = true;
      stopHeartbeat();
      clearTimeoutGuard();
    });

    // ----------- ANALYTICS & CACHE KEY -----------
    const ultimaMsg = String(mensagensParaIA.at(-1)?.content ?? "");
    const trimmedUltimaMsg = ultimaMsg.trim();
    log.info("🗣️ Última mensagem:", safeLog(ultimaMsg));

    if (isGuest && guestId && guestInteractionCount != null) {
      if (guestInteractionCount === 1) {
        trackGuestStart({
          guestId,
          sessaoId: sessionMeta?.sessaoId ?? null,
          origem: sessionMeta?.origem ?? null,
        });
      }
      trackGuestMessage({
        guestId,
        ordem: guestInteractionCount,
        max: guestSessionConfig.maxInteractions,
        tamanhoCaracteres: ultimaMsg.length,
        sessaoId: sessionMeta?.sessaoId ?? null,
        origem: sessionMeta?.origem ?? null,
      });
    }

    trackMensagemRecebida({
      distinctId,
      userId: analyticsUserId,
      origem: "texto",
      tipo: getMensagemTipo(mensagensParaIA),
      tamanhoCaracteres: ultimaMsg.length,
      timestamp: new Date().toISOString(),
      sessaoId: sessionMeta?.sessaoId ?? null,
      origemSessao: sessionMeta?.origem ?? null,
    });

    cacheKey = buildResponseCacheKey(pipelineUserId, ultimaMsg);
    let cachedPayload: CachedResponsePayload | null = null;
    if (cacheKey) {
      const cachedRaw = RESPONSE_CACHE.get(cacheKey);
      if (cachedRaw) {
        try {
          cachedPayload = JSON.parse(cachedRaw) as CachedResponsePayload;
        } catch (parseErr) {
          log.warn("⚠️ Falha ao parsear RESPONSE_CACHE:", { cacheKey, error: (parseErr as Error)?.message });
          RESPONSE_CACHE.delete(cacheKey);
        }
      }
    }

    const isRecord = (value: unknown): value is Record<string, any> =>
      typeof value === "object" && value !== null;

    if (cachedPayload && typeof cachedPayload.raw === "string") {
      activationTracer.markCache("hit");
      if (cachedPayload.modelo) {
        activationTracer.setModel(cachedPayload.modelo);
      }
      if (!cachedPayload.raw.includes("```json")) {
        const metaSource = isRecord(cachedPayload.meta) ? cachedPayload.meta : {};
        const normalizedResult: GetEcoResult = { message: cachedPayload.raw };

        if (typeof metaSource.intensidade === "number") normalizedResult.intensidade = metaSource.intensidade;
        if (typeof metaSource.resumo === "string" && metaSource.resumo.trim())
          normalizedResult.resumo = metaSource.resumo;
        if (typeof metaSource.emocao === "string" && metaSource.emocao.trim())
          normalizedResult.emocao = metaSource.emocao;
        if (Array.isArray(metaSource.tags)) {
          normalizedResult.tags = metaSource.tags.filter((tag): tag is string => typeof tag === "string");
        }
        if (typeof metaSource.categoria === "string" || metaSource.categoria === null) {
          normalizedResult.categoria = metaSource.categoria ?? null;
        }
        if (metaSource.proactive !== undefined) {
          normalizedResult.proactive =
            typeof metaSource.proactive === "object" || metaSource.proactive === null
              ? (metaSource.proactive as GetEcoResult["proactive"])
              : null;
        }

        const rebuiltRaw = buildFinalizedStreamText(normalizedResult);
        let normalizedMeta: Record<string, any> | null = isRecord(cachedPayload.meta) ? { ...cachedPayload.meta } : null;
        if (normalizedMeta) normalizedMeta.length = rebuiltRaw.length;
        else normalizedMeta = { length: rebuiltRaw.length };

        const updatedPayload: CachedResponsePayload = {
          ...cachedPayload,
          raw: rebuiltRaw,
          meta: normalizedMeta,
        };
        cachedPayload = updatedPayload;

        if (cacheKey) {
          try {
            RESPONSE_CACHE.set(cacheKey, JSON.stringify(updatedPayload), CACHE_TTL_MS);
          } catch (cacheErr) {
            log.warn("⚠️ Falha ao atualizar RESPONSE_CACHE legado:", {
              cacheKey,
              error: (cacheErr as Error)?.message,
            });
          }
        }
      }

      const promptReadyAt = now();
      log.info("// LATENCY: cache-hit", { userId: pipelineUserId, cacheKey });
      trackEcoCache({ distinctId, userId: analyticsUserId, status: "hit", key: cacheKey ?? undefined, source: "openrouter" });
      latestTimings = cachedPayload.timings ?? latestTimings;
      emitLatency("prompt_ready", promptReadyAt, latestTimings);
      dispatchEvent({
        type: "prompt_ready",
        at: promptReadyAt,
        sinceStartMs: promptReadyAt - t0,
        timings: latestTimings,
      });
      dispatchEvent({ type: "first_token" });
      const firstChunkAt = now();
      firstChunkLogged = true;
      emitLatency("ttfb", firstChunkAt, latestTimings);
      aggregatedText = cachedPayload.raw;
      chunkReceived = true;
      lastChunkIndex = 0;
      dispatchEvent({ type: "chunk", delta: cachedPayload.raw, index: 0, cache: true });
      const doneAt = now();
      emitLatency("ttlc", doneAt, latestTimings);
      const doneMetaBase =
        cachedPayload.meta ?? {
          ...(cachedPayload.usage ? { usage: cachedPayload.usage } : {}),
          ...(cachedPayload.modelo ? { modelo: cachedPayload.modelo } : {}),
          length: cachedPayload.raw.length,
        };
      const donePayload: Record<string, unknown> = {
        type: "done",
        meta: { ...doneMetaBase, cache: true },
        at: doneAt,
        sinceStartMs: doneAt - t0,
        timings: latestTimings,
      };
      if (debugRequested) {
        donePayload.trace = activationTracer.snapshot();
      }
      dispatchEvent(donePayload);
      endStream();
      return;
    }

    if (cacheKey) {
      activationTracer.markCache("miss");
      log.info("// LATENCY: cache-miss", { userId: pipelineUserId, cacheKey });
      trackEcoCache({ distinctId, userId: analyticsUserId, status: "miss", key: cacheKey, source: "openrouter" });
    }

    if (trimmedUltimaMsg.length >= 6) {
      try {
        await getEmbeddingCached(trimmedUltimaMsg, "entrada_usuario");
      } catch (embeddingErr: any) {
        log.warn("⚠️ Falha ao aquecer cache de embedding:", embeddingErr?.message ?? embeddingErr);
      }
    }

    const sendErrorAndEnd = (message: string) => {
      cacheable = false;
      if (!aggregatedText) {
        aggregatedText = message;
      }
      activationTracer.addError("stream", message);
      dispatchEvent({ type: "error", message });
      const at = now();
      emitLatency("ttlc", at, latestTimings);
      const donePayload: Record<string, unknown> = {
        type: "done",
        meta: { fallback: true, reason: "error" },
        at,
        sinceStartMs: at - t0,
        timings: latestTimings,
      };
      if (debugRequested) {
        donePayload.trace = activationTracer.snapshot();
      }
      dispatchEvent(donePayload);
      clearTimeoutGuard();
      endStream();
    };

    let doneNotified = false;
    const streamHandler: EcoStreamHandler = {
      async onEvent(event) {
        if (event.type === "chunk") {
          if (!firstChunkLogged) {
            firstChunkLogged = true;
            const at = now();
            emitLatency("ttfb", at, latestTimings);
          }
          aggregatedText += event.content;
          chunkReceived = true;
          lastChunkIndex = event.index;
          clearTimeoutGuard();
          dispatchEvent({ type: "chunk", delta: event.content, index: event.index });
          return;
        }
        if (event.type === "error") {
          cacheable = false;
          sendErrorAndEnd(event.error.message);
          return;
        }
        if (event.type === "control") {
          if (event.name === "prompt_ready") {
            latestTimings = event.timings ?? latestTimings;
            const at = now();
            emitLatency("prompt_ready", at, latestTimings);
            dispatchEvent({ type: "prompt_ready", at, sinceStartMs: at - t0, timings: latestTimings });
            return;
          }
          if (event.name === "first_token") {
            dispatchEvent({ type: "first_token" });
            return;
          }
          if (event.name === "reconnect") {
            dispatchEvent({ type: "reconnect", attempt: event.attempt ?? 0 });
            return;
          }
          if (event.name === "done") {
            doneNotified = true;
            cacheCandidateMeta = event.meta ?? null;
            cacheCandidateTimings = event.timings ?? latestTimings;
            latestTimings = event.timings ?? latestTimings;
            if (!chunkReceived && respondAsStream) {
              triggerTimeoutFallback();
              return;
            }
            const at = now();
            emitLatency("ttlc", at, latestTimings);
            const donePayload: Record<string, unknown> = {
              type: "done",
              meta: event.meta ?? {},
              at,
              sinceStartMs: at - t0,
              timings: latestTimings,
            };
            if (debugRequested) {
              donePayload.trace = activationTracer.snapshot();
            }
            dispatchEvent(donePayload);
            clearTimeoutGuard();
            endStream();
          }
        }
      },
    };

    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: pipelineUserId,
      userName: nome_usuario,
      accessToken: token,
      sessionMeta,
      stream: streamHandler,
      isGuest,
      guestId: guestId ?? undefined,
      activationTracer,
    });

    if (resposta && typeof (resposta as any)?.modelo === "string") {
      activationTracer.setModel((resposta as any).modelo);
    }

    setImmediate(() => {
      Promise.allSettled([resposta.finalize()]).catch((finalErr) => {
        log.warn("⚠️ Pós-processamento /ask-eco rejeitado:", finalErr);
      });
    });

    if (!doneNotified && !streamClosed) {
      const at = now();
      const fallbackTimings = (resposta as { timings?: EcoLatencyMarks })?.timings ?? latestTimings;
      latestTimings = fallbackTimings ?? latestTimings;
      emitLatency("ttlc", at, latestTimings);
      const fallbackMeta = resposta?.usage ? { usage: resposta.usage } : {};
      cacheCandidateMeta = fallbackMeta;
      cacheCandidateTimings = latestTimings;
      const donePayload: Record<string, unknown> = {
        type: "done",
        meta: fallbackMeta,
        at,
        sinceStartMs: at - t0,
        timings: latestTimings,
      };
      if (debugRequested) {
        donePayload.trace = activationTracer.snapshot();
      }
      dispatchEvent(donePayload);
      clearTimeoutGuard();
      endStream();
    }

    const shouldStore =
      Boolean(cacheKey) &&
      cacheable &&
      !clientDisconnected &&
      typeof resposta?.raw === "string" &&
      resposta.raw.length > 0;

    if (shouldStore && cacheKey) {
      const metaFromDone =
        cacheCandidateMeta
          ? { ...cacheCandidateMeta }
          : resposta?.usage || resposta?.modelo
          ? {
              ...(resposta.usage ? { usage: resposta.usage } : {}),
              ...(resposta.modelo ? { modelo: resposta.modelo } : {}),
              length: resposta.raw.length,
            }
          : null;

      const metaRecord = metaFromDone as Record<string, any> | null;
      const payload: CachedResponsePayload = {
        raw: resposta.raw,
        meta: metaFromDone,
        modelo:
          resposta?.modelo ??
          (typeof metaRecord?.modelo === "string" ? (metaRecord.modelo as string) : null),
        usage:
          resposta?.usage ??
          (metaRecord && Object.prototype.hasOwnProperty.call(metaRecord, "usage") ? metaRecord.usage : undefined),
        timings: cacheCandidateTimings ?? resposta?.timings,
      };

      try {
        RESPONSE_CACHE.set(cacheKey, JSON.stringify(payload), CACHE_TTL_MS);
        log.info("// LATENCY: cache-store", { cacheKey, userId: pipelineUserId, length: resposta.raw.length });
      } catch (cacheErr) {
        log.warn("⚠️ Falha ao salvar RESPONSE_CACHE:", (cacheErr as Error)?.message);
      }
    }

    if (!respondAsStream) {
      const finalRaw =
        typeof resposta?.raw === "string" && resposta.raw.length > 0
          ? resposta.raw
          : aggregatedText || STREAM_TIMEOUT_MESSAGE;

      const baseMeta = cacheCandidateMeta
        ? { ...cacheCandidateMeta }
        : resposta?.usage || resposta?.modelo
        ? {
            ...(resposta.usage ? { usage: resposta.usage } : {}),
            ...(resposta.modelo ? { modelo: resposta.modelo } : {}),
          }
        : null;

      if (baseMeta && typeof baseMeta === "object" && !("length" in baseMeta)) {
        (baseMeta as Record<string, unknown>).length = finalRaw.length;
      }

      const timingsPayload = cacheCandidateTimings ?? resposta?.timings ?? latestTimings ?? null;

      res.status(200).json({
        ok: true,
        stream: false,
        message: finalRaw,
        meta: baseMeta,
        timings: timingsPayload,
        events: offlineEvents,
        ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
      });
      return;
    }

    return;
  } catch (err: any) {
    log.error("❌ Erro no /ask-eco:", {
      message: err?.message,
      stack: (err?.stack || "").split("\n").slice(0, 4).join(" ⏎ "),
    });
    const message = err?.message || "Erro interno ao processar a requisição.";
    // se SSE já começou, finaliza como evento
    if ((res as any).headersSent) {
      try {
        (res as any).write?.(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
        (res as any).write?.(
          `data: ${JSON.stringify({ type: "done", meta: { fallback: true, reason: "error" } })}\n\n`
        );
      } catch {}
      try {
        (res as any).end?.();
      } catch {}
      return;
    }
    return res.status(200).json({
      ok: false,
      error: { message, statusCode: 500 },
    });
  }
});

router.get("/debug/trace/:id", (req: Request, res: Response) => {
  const traceId = req.params.id;
  if (!traceId) {
    return res.status(400).json({
      ok: false,
      error: { message: "TraceId inválido.", statusCode: 400 },
    });
  }

  const trace = getActivationTrace(traceId);
  if (!trace) {
    return res.status(404).json({
      ok: false,
      error: { message: "Trace não encontrado.", statusCode: 404 },
    });
  }

  return res.status(200).json({ ok: true, trace });
});

export default router;
