// routes/openrouterRoutes.ts
import crypto from "node:crypto";
import express, { type Request, type Response } from "express";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

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

const CACHE_TTL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

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

router.post("/ask-eco", async (req: GuestAwareRequest, res: Response) => {
  const t0 = now();
  const promptReadyImmediate =
    req.body?.promptReadyImmediate === true ||
    req.body?.promptReadyImmediate === "true" ||
    req.body?.latency?.promptReadyImmediate === true ||
    req.body?.latency?.promptReadyImmediate === "true";

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
  let sseStarted = false;
  let streamClosed = false;
  let sendSseRef: ((payload: Record<string, unknown>) => void) | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let endStreamRef: (() => void) | null = null;

  const mensagensBrutas = normalizarMensagens(req.body);
  if (!mensagensBrutas || mensagensBrutas.length === 0) {
    return res.status(400).json({ error: "messages são obrigatórios." });
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
      return res.status(statusCode).json({
        error: sanitizationError?.message || "Entrada inválida para o modo convidado.",
      });
    }
  }

  // ----------- GUARD DE AUTENTICAÇÃO -----------
  if (!isGuest) {
    if (!hasBearer || !token) {
      return res.status(401).json({ error: "Token de acesso ausente." });
    }
    if (!usuarioIdBody) {
      return res.status(400).json({ error: "usuario_id e messages são obrigatórios." });
    }
  }

  // Define o "userId" que o pipeline vai usar (diferencia convidados)
  const pipelineUserId = isGuest ? `guest:${guestId!}` : String(usuarioIdBody);
  if (!pipelineUserId) {
    return res.status(400).json({ error: "Usuário inválido." });
  }

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
      return res.status(429).json({ error: "Limite de interações do modo convidado atingido." });
    }
    // Se o middleware usa req.guest, atualiza contagem (opcional)
    if (req.guest) {
      req.guest.interactionsUsed = guestInteractionCount;
    }
  }

  try {
    // ----------- VALIDAÇÃO DO TOKEN QUANDO USER -----------
    if (!isGuest) {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        console.warn(
          `[openrouterRoutes][critical][env=${process.env.NODE_ENV ?? "development"}] Supabase admin misconfigured`
        );
        return res.status(500).json({ error: "Supabase admin misconfigured" });
      }

      const { data, error } = await supabase.auth.getUser(token!);
      if (error || !data?.user) {
        return res.status(401).json({ error: "Token inválido ou usuário não encontrado." });
      }
    }

    // ----------- SSE BOOTSTRAP -----------
    let latestTimings: EcoLatencyMarks | undefined;
    let firstChunkLogged = false;
    let cacheKey: string | null = null;
    let cacheable = true;
    let cacheCandidateMeta: Record<string, any> | null = null;
    let cacheCandidateTimings: EcoLatencyMarks | undefined;
    let clientDisconnected = false;

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const sendHeartbeat = () => {
      if (streamClosed || !sseStarted) return;
      streamingRes.write(`:keepalive\n\n`);
      streamingRes.flush?.();
    };

    const ensureHeartbeat = () => {
      if (heartbeatTimer || streamClosed) return;
      heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    };

    const startSse = () => {
      if (sseStarted) return;
      sseStarted = true;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      streamingRes.flushHeaders?.();
      streamingRes.flush?.();
      ensureHeartbeat();
    };

    const sendSse = (payload: Record<string, unknown>) => {
      if (streamClosed) return;
      startSse();
      streamingRes.write(`data: ${JSON.stringify(payload)}\n\n`);
      streamingRes.flush?.();
    };
    sendSseRef = sendSse;

    const endStream = () => {
      if (!streamClosed) {
        streamClosed = true;
        stopHeartbeat();
        streamingRes.end();
      }
    };
    endStreamRef = endStream;

    const emitLatency = (stage: "prompt_ready" | "ttfb" | "ttlc", at: number, timings?: EcoLatencyMarks) => {
      const sinceStartMs = at - t0;
      log.info(`// LATENCY: ${stage}`, { at, sinceStartMs, timings });
      sendSse({ type: "latency", stage, at, sinceStartMs, timings });
    };

    startSse();

    if (promptReadyImmediate) {
      const at = now();
      emitLatency("prompt_ready", at);
      sendSse({ type: "prompt_ready", at, sinceStartMs: at - t0 });
    }

    req.on("close", () => {
      if (!streamClosed) {
        clientDisconnected = true;
      }
      streamClosed = true;
      stopHeartbeat();
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
      sendSse({ type: "prompt_ready", at: promptReadyAt, sinceStartMs: promptReadyAt - t0, timings: latestTimings });
      sendSse({ type: "first_token" });
      const firstChunkAt = now();
      firstChunkLogged = true;
      emitLatency("ttfb", firstChunkAt, latestTimings);
      sendSse({ type: "chunk", delta: cachedPayload.raw, index: 0, cache: true });
      const doneAt = now();
      emitLatency("ttlc", doneAt, latestTimings);
      const doneMetaBase =
        cachedPayload.meta ?? {
          ...(cachedPayload.usage ? { usage: cachedPayload.usage } : {}),
          ...(cachedPayload.modelo ? { modelo: cachedPayload.modelo } : {}),
          length: cachedPayload.raw.length,
        };
      sendSse({ type: "done", meta: { ...doneMetaBase, cache: true }, at: doneAt, sinceStartMs: doneAt - t0, timings: latestTimings });
      endStream();
      return;
    }

    if (cacheKey) {
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
      sendSse({ type: "error", message });
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
          sendSse({ type: "chunk", delta: event.content, index: event.index });
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
            sendSse({ type: "prompt_ready", at, sinceStartMs: at - t0, timings: latestTimings });
            return;
          }
          if (event.name === "first_token") {
            sendSse({ type: "first_token" });
            return;
          }
          if (event.name === "reconnect") {
            sendSse({ type: "reconnect", attempt: event.attempt ?? 0 });
            return;
          }
          if (event.name === "done") {
            doneNotified = true;
            cacheCandidateMeta = event.meta ?? null;
            cacheCandidateTimings = event.timings ?? latestTimings;
            latestTimings = event.timings ?? latestTimings;
            const at = now();
            emitLatency("ttlc", at, latestTimings);
            sendSse({ type: "done", meta: event.meta ?? {}, at, sinceStartMs: at - t0, timings: latestTimings });
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
    });

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
      sendSse({ type: "done", meta: fallbackMeta, at, sinceStartMs: at - t0, timings: latestTimings });
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

    return;
  } catch (err: any) {
    log.error("❌ Erro no /ask-eco:", { message: err?.message, stack: err?.stack });
    const message = err?.message || "Erro interno ao processar a requisição.";
    // Se já iniciou SSE, devolve como evento
    if (sseStarted || res.headersSent) {
      sendSseRef?.({ type: "error", message });
      if (!streamClosed) {
        endStreamRef?.();
      }
      (res as any).end?.();
      return;
    }
    return res.status(500).json({
      error: "Erro interno ao processar a requisição.",
      details: { message: err?.message, stack: err?.stack },
    });
  }
});

export default router;
