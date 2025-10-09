// routes/openrouterRoutes.ts
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

// montar contexto e log
import { log } from "../services/promptContext/logger";
import { now } from "../utils";
import { RESPONSE_CACHE } from "../services/CacheService";
import requireAdmin from "../mw/requireAdmin";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import {
  ActivationTracer,
  saveActivationTrace,
  getActivationTrace,
  type ActivationTraceSnapshot,
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

// log seguro
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

// normalizador
function normalizarMensagens(body: any): Array<{ role: string; content: any }> | null {
  const { messages, mensagens, mensagem } = body || {};
  if (Array.isArray(messages)) return messages;
  if (Array.isArray(mensagens)) return mensagens;
  if (mensagem) return [{ role: "user", content: mensagem }];
  return null;
}

router.post("/ask-eco", requireAdmin, async (req: GuestAwareRequest, res: Response) => {
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
  // Preferência: middleware popula req.guest / req.userId.
  // Fallbacks: headers/body.
  const headerGuestId =
    (req.headers["x-guest-id"] as string | undefined)?.trim() ||
    (req.headers["X-Guest-Id"] as string | undefined)?.trim();

  const bodyIsGuest = Boolean(req.body?.isGuest);
  const bodyGuestId = typeof req.body?.guestId === "string" ? req.body.guestId.trim() : "";

  const authHeader = req.headers.authorization;
  const hasBearer = typeof authHeader === "string" && /^Bearer\s+/i.test(authHeader.trim());
  const token = hasBearer ? authHeader!.trim().replace(/^Bearer\s+/i, "") : undefined;

  // Se veio Bearer válido, tratamos como user; caso contrário, se houver qualquer guestId/flag, tratamos como guest.
  let isGuest = false;
  let guestId: string | null = null;

  if (hasBearer && token) {
    isGuest = false;
  } else if (req.guest?.id || headerGuestId || bodyIsGuest || bodyGuestId) {
    isGuest = true;
    guestId = (req.guest?.id || headerGuestId || bodyGuestId || "").trim() || null;
  } else {
    // Sem token e sem guestId declarado → gera um guestId efêmero
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

  // ----------- GUARD DE AUTENTICAÇÃO -----------
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

  // Define o "userId" que o pipeline vai usar (diferencia convidados)
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
    // Se o middleware usa req.guest, atualiza contagem (opcional)
    if (req.guest) {
      req.guest.interactionsUsed = guestInteractionCount;
    }
  }

  try {
    // ----------- VALIDAÇÃO DO TOKEN QUANDO USER -----------
    if (!isGuest) {
      const supabaseClient = req.supabaseAdmin ?? ensureSupabaseConfigured();
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
      accessToken: token, // pode ser undefined no guest; seu orquestrador deve tolerar
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
      Promise.allSettled([resposta.finalize()])
        .then((settled) => {
          settled.forEach((result) => {
            if (result.status === "rejected") {
              log.warn("⚠️ Pós-processamento /ask-eco falhou:", result.reason);
            }
          });
        })
        .catch((finalErr) => {
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
    log.error("❌ Erro no /ask-eco:", { message: err?.message, stack: err?.stack });
    const message = err?.message || "Erro interno ao processar a requisição.";
    activationTracer.addError("ask-eco", message);
    // Se já iniciou SSE, devolve como evento amigável
    if (sseStarted || res.headersSent) {
      sendSseRef?.({ type: "error", message });
      const at = now();
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
      sendSseRef?.(donePayload);
      if (!streamClosed) {
        endStreamRef?.();
      }
      (res as any).end?.();
      return;
    }
    return res.status(200).json({
      ok: false,
      error: { message, statusCode: 500 },
      ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
    });
  }
});

router.get("/debug/trace/:id", requireAdmin, (req: GuestAwareRequest, res: Response) => {
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

router.get("/debug/trace-viewer", requireAdmin, (req: GuestAwareRequest, res: Response) => {
  if (!process.env.ECO_TRACE_DEBUG) {
    res.status(403).send("Trace Viewer desativado");
    return;
  }

  const traceIdParam = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const trace = traceIdParam ? getActivationTrace(traceIdParam) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(buildTraceViewerHtml(traceIdParam, trace));
});

function buildTraceViewerHtml(traceId: string, trace: ActivationTraceSnapshot | null): string {
  const hasTrace = Boolean(trace);
  const message = !traceId
    ? "Forneça um traceId para visualizar os dados."
    : hasTrace
    ? ""
    : "Trace não encontrado";

  const promptReadyMs = trace?.latency.promptReadyMs ?? 0;
  const firstTokenMs = trace?.latency.firstTokenMs ?? 0;
  const totalMs = trace?.latency.totalMs ?? 0;

  const summaryTable = hasTrace
    ? renderTable(
        [
          ["Trace ID", trace.traceId],
          ["User ID", trace.userId ?? "—"],
          ["Modelo", trace.model ?? "—"],
          ["Cache", trace.cacheStatus ?? "—"],
          ["Início", trace.startedAt ?? "—"],
          ["Fim", trace.finishedAt ?? "—"],
        ],
        ["Campo", "Valor"]
      )
    : "";

  const heuristicsSection = renderSection(
    "Heurísticas",
    hasTrace
      ? trace.heuristics.length
        ? renderTable(
            trace.heuristics.map(({ key, evidence }) => [
              key,
              typeof evidence === "undefined"
                ? "—"
                : rawCell(`<pre>${escapeHtml(JSON.stringify(evidence, null, 2))}</pre>`),
            ]),
            ["Chave", "Evidência"]
          )
        : "<p class=\"empty\">Nenhuma heurística registrada.</p>"
      : "<p class=\"empty\">Carregue um trace para visualizar.</p>"
  );

  const modulesSection = renderSection(
    "Módulos",
    hasTrace
      ? trace.modules.length
        ? renderTable(
            trace.modules.map(({ name, reason, mode }) => [
              name,
              reason ?? "—",
              mode ?? "—",
            ]),
            ["Nome", "Razão", "Modo"]
          )
        : "<p class=\"empty\">Nenhum módulo registrado.</p>"
      : "<p class=\"empty\">Carregue um trace para visualizar.</p>"
  );

  const embeddingSection = renderSection(
    "Embedding Result",
    hasTrace && trace.embeddingResult
      ? renderTable([
          ["Hits", trace.embeddingResult.hits ?? "—"],
          ["Similaridade", valueOrDash(trace.embeddingResult.similarity)],
          ["Limite", valueOrDash(trace.embeddingResult.threshold)],
        ])
      : hasTrace
      ? "<p class=\"empty\">Sem dados de embedding.</p>"
      : "<p class=\"empty\">Carregue um trace para visualizar.</p>"
  );

  const memorySection = renderSection(
    "Memory Decision",
    hasTrace && trace.memoryDecision
      ? renderTable([
          ["Salvar", trace.memoryDecision.willSave === null ? "—" : trace.memoryDecision.willSave ? "Sim" : "Não"],
          ["Intensidade", valueOrDash(trace.memoryDecision.intensity)],
          ["Motivo", trace.memoryDecision.reason ?? "—"],
        ])
      : hasTrace
      ? "<p class=\"empty\">Nenhuma decisão registrada.</p>"
      : "<p class=\"empty\">Carregue um trace para visualizar.</p>"
  );

  const latencySection = renderSection(
    "Latência",
    hasTrace
      ? renderTable(
          [
            ["Prompt Ready (ms)", valueOrDash(trace.latency.promptReadyMs)],
            ["Primeiro Token (ms)", valueOrDash(trace.latency.firstTokenMs)],
            ["Total (ms)", valueOrDash(trace.latency.totalMs)],
          ]
        )
      : "<p class=\"empty\">Carregue um trace para visualizar.</p>"
  );

  const errorsSection = renderSection(
    "Erros",
    hasTrace && trace.errors.length
      ? renderTable(
          trace.errors.map(({ where, message }) => [where, message]),
          ["Local", "Mensagem"]
        )
      : hasTrace
      ? "<p class=\"empty\">Nenhum erro registrado.</p>"
      : "<p class=\"empty\">Carregue um trace para visualizar.</p>"
  );

  const sequenceDiagram = `sequenceDiagram
  participant C as Client
  participant E as /ask-eco
  participant O as getEcoResponse
  participant P as prepareContext
  participant B as ContextBuilder
  participant M as LLM
  C->>E: POST /ask-eco
  E->>O: getEcoResponse()
  O->>P: prepareContext()
  P->>B: montarContextoEco()
  B->>M: prompt
  M-->>E: tokens + done
  E-->>C: resposta final`;

  const timelineDiagram = `gantt
  dateFormat  X
  title  Latência
  section Tempo
  PromptReady :a1, 0, ${promptReadyMs}
  FirstToken  :a2, 0, ${firstTokenMs}
  Total       :a3, 0, ${totalMs}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Eco – Activation Trace Viewer</title>
    <link rel="preconnect" href="https://cdn.jsdelivr.net" />
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        padding: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f9;
        color: #1c1c1c;
      }
      .container {
        max-width: 960px;
        margin: 0 auto;
        padding: 32px 16px 64px;
      }
      header {
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.8rem;
      }
      form {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 24px;
      }
      input[type="text"] {
        flex: 1;
        min-width: 220px;
        padding: 10px 12px;
        font-size: 1rem;
        border-radius: 8px;
        border: 1px solid #c5c7ce;
        background: #fff;
      }
      button {
        padding: 10px 16px;
        font-size: 1rem;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        background: #2d63ff;
        color: #fff;
      }
      .message {
        margin-bottom: 16px;
        color: #d23f31;
        font-weight: 600;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        padding: 8px 10px;
        border-bottom: 1px solid #e0e3eb;
        text-align: left;
        vertical-align: top;
      }
      th {
        font-weight: 600;
        color: #384260;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .empty {
        color: #6b7280;
        font-style: italic;
      }
      pre {
        margin: 0;
        padding: 8px;
        background: #f1f4f8;
        border-radius: 6px;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.9rem;
      }
      .panels {
        display: grid;
        gap: 16px;
      }
      details.panel {
        background: #fff;
        border-radius: 12px;
        border: 1px solid #e0e3eb;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        padding: 0 16px 12px;
      }
      details.panel > summary {
        cursor: pointer;
        font-weight: 600;
        padding: 16px 0 12px;
        list-style: none;
      }
      details.panel[open] > summary {
        border-bottom: 1px solid #e0e3eb;
        margin-bottom: 12px;
      }
      .mermaid {
        background: #fff;
        border-radius: 12px;
        border: 1px solid #e0e3eb;
        padding: 16px;
        margin-top: 24px;
      }
      .summary-card {
        background: #fff;
        border-radius: 12px;
        border: 1px solid #e0e3eb;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        padding: 16px;
        margin-bottom: 24px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>Eco – Activation Trace Viewer</h1>
        <form method="get" action="/debug/trace-viewer">
          <input type="text" name="id" placeholder="Trace ID" value="${escapeHtml(traceId)}" />
          <button type="submit">Carregar</button>
        </form>
        ${message ? `<div class="message">${escapeHtml(message)}</div>` : ""}
      </header>
      ${summaryTable ? `<div class="summary-card">${summaryTable}</div>` : ""}
      <div class="panels">
        ${heuristicsSection}
        ${modulesSection}
        ${embeddingSection}
        ${memorySection}
        ${latencySection}
        ${errorsSection}
      </div>
      <div class="mermaid">${escapeHtml(sequenceDiagram)}</div>
      <div class="mermaid">${escapeHtml(timelineDiagram)}</div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({ startOnLoad: true, theme: "neutral" });</script>
  </body>
</html>`;
}

function renderSection(title: string, content: string): string {
  return `<details class="panel" open>
  <summary>${escapeHtml(title)}</summary>
  <div class="panel-body">${content}</div>
</details>`;
}

type TableCell = string | number | null | { raw: string };

function renderTable(rows: TableCell[][], headers?: string[]): string {
  const thead = headers
    ? `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`
    : "";
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells
          .map((cell) => `<td>${normalizeCell(cell)}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<table>${thead}<tbody>${body}</tbody></table>`;
}

function normalizeCell(cell: TableCell): string {
  if (cell === null || typeof cell === "undefined") {
    return "—";
  }
  if (typeof cell === "object" && "raw" in cell) {
    return cell.raw;
  }
  return escapeHtml(String(cell));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function valueOrDash(value: number | string | null | undefined): TableCell {
  if (value === null || typeof value === "undefined") {
    return "—";
  }
  return rawCell(escapeHtml(String(value)));
}

function rawCell(html: string): { raw: string } {
  return { raw: html };
}

export default router;
