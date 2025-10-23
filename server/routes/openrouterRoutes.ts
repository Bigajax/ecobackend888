import express, { type Response } from "express";

import { getEcoResponse } from "../services/ConversationOrchestrator";
import { extractSessionMeta } from "./sessionMeta";
import {
  trackEcoCache,
  trackGuestMessage,
  trackGuestStart,
  trackMensagemRecebida,
} from "../analytics/events/mixpanelEvents";
import { getEmbeddingCached } from "../adapters/EmbeddingAdapter";
import { guestSessionConfig } from "../core/http/middlewares/guestSession";
import { log } from "../services/promptContext/logger";
import { now } from "../utils";
// import requireAdmin from "../mw/requireAdmin"; // ⚠️ não usar neste endpoint para permitir guest
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { ActivationTracer, getActivationTrace, saveActivationTrace } from "../core/activationTracer";
import { registrarMensagem } from "../services/mensagemService";

import {
  attachGuestToSessionMeta,
  ensureAuthenticatedUserRequest,
  enforceGuestRateLimit,
  resolveGuestIdentity,
} from "./askEco/guestSession";
import {
  getMensagemTipo,
  isDebugRequested,
  normalizarMensagens,
  parsePromptReadyImmediate,
  resolveStreamPreference,
  sanitizeGuestMessages,
  safeLog,
  type GuestAwareRequest,
} from "./askEco/requestParsing";
import {
  buildResponseCacheKey,
  getCachedResponsePayload,
  normalizeCachedResponse,
  storeResponseInCache,
  type CachedResponsePayload,
} from "./askEco/cache";
import { STREAM_TIMEOUT_MESSAGE, StreamSession } from "./askEco/streaming";
import { AskEcoRequestError } from "./askEco/errors";

const router = express.Router();

router.post("/ask-eco", async (req: GuestAwareRequest, res: Response) => {
  const t0 = now();
  const promptReadyImmediate = parsePromptReadyImmediate(req);
  const debugRequested = isDebugRequested(req);
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

  const mensagensBrutas = normalizarMensagens(req.body);
  if (!mensagensBrutas || mensagensBrutas.length === 0) {
    activationTracer.addError("validation", "messages são obrigatórios.");
    return res.status(200).json({
      ok: false,
      error: { message: "messages são obrigatórios.", statusCode: 400 },
      ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
    });
  }

  const identity = resolveGuestIdentity(req);

  let authenticatedUserId: string | null = null;
  let userSupabaseClient: any = null;

  let mensagensParaIA = mensagensBrutas;
  if (identity.isGuest) {
    try {
      mensagensParaIA = sanitizeGuestMessages(mensagensBrutas);
    } catch (error: any) {
      const statusCode = Number.isInteger(error?.status) ? Number(error.status) : 400;
      activationTracer.addError(
        "sanitize_guest_messages",
        error?.message || "Entrada inválida para o modo convidado."
      );
      return res.status(200).json({
        ok: false,
        error: {
          message: error?.message || "Entrada inválida para o modo convidado.",
          statusCode,
        },
        ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
      });
    }
  }

  const { usuario_id: usuarioIdBody, nome_usuario } = req.body ?? {};

  try {
    ensureAuthenticatedUserRequest(identity, usuarioIdBody);
  } catch (error) {
    if (error instanceof AskEcoRequestError) {
      activationTracer.addError("auth", error.message);
      return res.status(200).json({
        ok: false,
        error: { message: error.message, statusCode: error.statusCode },
        ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
      });
    }
    throw error;
  }

  const pipelineUserId = identity.isGuest
    ? `guest:${identity.guestId ?? ""}`
    : String(usuarioIdBody ?? "");

  if (!pipelineUserId) {
    activationTracer.addError("validation", "Usuário inválido.");
    return res.status(200).json({
      ok: false,
      error: { message: "Usuário inválido.", statusCode: 400 },
      ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
    });
  }

  activationTracer.setUserId(pipelineUserId);

  let sessionMeta = extractSessionMeta(req.body);
  sessionMeta = sessionMeta ? { ...sessionMeta } : undefined;
  const guestMeta = attachGuestToSessionMeta(sessionMeta, identity.isGuest ? identity.guestId : null);
  sessionMeta = guestMeta.sessionMeta;
  const distinctId = guestMeta.distinctId ?? (identity.isGuest ? identity.guestId ?? undefined : undefined);
  let analyticsUserId: string | undefined = identity.isGuest ? undefined : usuarioIdBody;

  let guestInteractionCount: number | null = null;
  if (identity.isGuest && identity.guestId) {
    try {
      guestInteractionCount = enforceGuestRateLimit(req, identity.guestId, activationTracer);
    } catch (error) {
      if (error instanceof AskEcoRequestError) {
        return res.status(200).json({
          ok: false,
          error: { message: error.message, statusCode: error.statusCode },
          ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
        });
      }
      throw error;
    }
  }

  const streamPreference = resolveStreamPreference(req, identity.isGuest);
  const streamSession = new StreamSession({
    req,
    res,
    respondAsStream: streamPreference.respondAsStream,
    activationTracer,
    startTime: t0,
    debugRequested,
  });
  streamSession.initialize(promptReadyImmediate);

  try {
    if (!identity.isGuest) {
      const supabaseClient = (req as any).admin ?? ensureSupabaseConfigured();
      const { data, error } = await supabaseClient.auth.getUser(identity.token!);
      if (error || !data?.user) {
        activationTracer.addError("auth", "Token inválido ou usuário não encontrado.");
        return res.status(200).json({
          ok: false,
          error: { message: "Token inválido ou usuário não encontrado.", statusCode: 401 },
          ...(debugRequested ? { trace: activationTracer.snapshot() } : {}),
        });
      }

      authenticatedUserId = data.user.id;
      analyticsUserId = authenticatedUserId ?? analyticsUserId;

      try {
        userSupabaseClient = supabaseWithBearer(identity.token!);
      } catch (clientError) {
        const message = clientError instanceof Error ? clientError.message : String(clientError);
        log.warn("[mensagem] Falha ao criar cliente autenticado do Supabase:", message);
      }
    }

    const ultimaMsg = String(mensagensParaIA.at(-1)?.content ?? "");
    const trimmedUltimaMsg = ultimaMsg.trim();
    log.info("🗣️ Última mensagem:", safeLog(ultimaMsg));

    const usuarioParaMensagem = authenticatedUserId ?? (typeof usuarioIdBody === "string" ? usuarioIdBody : null);
    const conteudoParaSalvar = trimmedUltimaMsg || ultimaMsg;
    if (
      !identity.isGuest &&
      userSupabaseClient &&
      usuarioParaMensagem &&
      typeof conteudoParaSalvar === "string" &&
      conteudoParaSalvar.trim().length > 0
    ) {
      try {
        const registro = await registrarMensagem(userSupabaseClient, {
          usuario_id: usuarioParaMensagem,
          conteudo: conteudoParaSalvar,
          salvar_memoria: false,
        });
        const lastIndex = mensagensParaIA.length - 1;
        if (lastIndex >= 0 && mensagensParaIA[lastIndex]) {
          mensagensParaIA[lastIndex] = {
            ...mensagensParaIA[lastIndex],
            id: registro.id,
          } as typeof mensagensParaIA[number];
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("[mensagem] Falha ao registrar mensagem no Supabase:", message);
      }
    }

    if (identity.isGuest && identity.guestId && guestInteractionCount != null) {
      if (guestInteractionCount === 1) {
        trackGuestStart({
          guestId: identity.guestId,
          sessaoId: sessionMeta?.sessaoId ?? null,
          origem: sessionMeta?.origem ?? null,
        });
      }
      trackGuestMessage({
        guestId: identity.guestId,
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

    const cacheKey = buildResponseCacheKey(pipelineUserId, ultimaMsg);
    let cachedPayload: CachedResponsePayload | null = getCachedResponsePayload(cacheKey);

    if (cachedPayload && typeof cachedPayload.raw === "string") {
      activationTracer.markCache("hit");
      if (cachedPayload.modelo) {
        activationTracer.setModel(cachedPayload.modelo);
      }
      cachedPayload = normalizeCachedResponse(cacheKey, cachedPayload);

      const promptReadyAt = now();
      log.info("// LATENCY: cache-hit", { userId: pipelineUserId, cacheKey });
      trackEcoCache({
        distinctId,
        userId: analyticsUserId,
        status: "hit",
        key: cacheKey ?? undefined,
        source: "openrouter",
      });

      const timings = cachedPayload.timings ?? streamSession.latestTimings;
      streamSession.markLatestTimings(timings);
      streamSession.emitLatency("prompt_ready", promptReadyAt, timings);
      const firstChunkAt = now();
      streamSession.emitLatency("ttfb", firstChunkAt, timings);
      const sanitizedCacheText = cachedPayload.raw
        .replace(/\r/g, " ")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (sanitizedCacheText) {
        streamSession.aggregatedText = sanitizedCacheText;
        streamSession.chunkReceived = true;
        streamSession.lastChunkIndex = 0;
        streamSession.dispatchEvent({ index: 0, text: sanitizedCacheText });
      } else {
        streamSession.aggregatedText = "";
        streamSession.chunkReceived = false;
        streamSession.lastChunkIndex = -1;
      }
      const doneAt = now();
      streamSession.emitLatency("ttlc", doneAt, timings);
      const doneIndex = streamSession.lastChunkIndex + 1;
      streamSession.dispatchEvent({ index: doneIndex, done: true });
      streamSession.end();
      return;
    }

    activationTracer.markCache("miss");
    log.info("// LATENCY: cache-miss", { userId: pipelineUserId, cacheKey });
    trackEcoCache({
      distinctId,
      userId: analyticsUserId,
      status: "miss",
      key: cacheKey,
      source: "openrouter",
    });

    if (trimmedUltimaMsg.length >= 6) {
      try {
        await getEmbeddingCached(trimmedUltimaMsg, "entrada_usuario");
      } catch (error: any) {
        log.warn("⚠️ Falha ao aquecer cache de embedding:", error?.message ?? error);
      }
    }

    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: pipelineUserId,
      authUid: authenticatedUserId ?? null,
      userName: nome_usuario,
      accessToken: identity.token,
      sessionMeta,
      stream: streamSession.createStreamHandler(),
      isGuest: identity.isGuest,
      guestId: identity.guestId ?? undefined,
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

    if (!streamSession.doneNotified && !streamSession.isClosed()) {
      const at = now();
      const fallbackTimings = (resposta as { timings?: any })?.timings ?? streamSession.latestTimings;
      streamSession.markLatestTimings(fallbackTimings);
      streamSession.emitLatency("ttlc", at, streamSession.latestTimings);
      const fallbackMeta = resposta?.usage ? { usage: resposta.usage } : {};
      streamSession.cacheCandidateMeta = fallbackMeta;
      streamSession.cacheCandidateTimings = streamSession.latestTimings;
      const doneIndex = streamSession.lastChunkIndex + 1;
      streamSession.dispatchEvent({ index: doneIndex, done: true });
      streamSession.clearTimeoutGuard();
      streamSession.end();
    }

    const shouldStore =
      Boolean(cacheKey) &&
      streamSession.cacheable &&
      !streamSession.clientDisconnected &&
      typeof resposta?.raw === "string" &&
      resposta.raw.length > 0;

    if (shouldStore && cacheKey) {
      const metaFromDone =
        streamSession.cacheCandidateMeta
          ? { ...streamSession.cacheCandidateMeta }
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
          (metaRecord && Object.prototype.hasOwnProperty.call(metaRecord, "usage")
            ? metaRecord.usage
            : undefined),
        timings: streamSession.cacheCandidateTimings ?? (resposta as any)?.timings,
      };

      storeResponseInCache(cacheKey, payload);
      log.info("// LATENCY: cache-store", {
        cacheKey,
        userId: pipelineUserId,
        length: resposta.raw.length,
      });
    }

    if (!streamSession.respondAsStream) {
      const events = Array.isArray(streamSession.offlineEvents)
        ? (streamSession.offlineEvents as Array<Record<string, unknown>>)
        : [];
      const doneEvent = [...events].reverse().find((entry) => entry?.type === "done");

      if (doneEvent && typeof doneEvent === "object") {
        res.status(200).json(doneEvent);
        return;
      }

      const finalRaw =
        typeof resposta?.raw === "string" && resposta.raw.length > 0
          ? resposta.raw
          : streamSession.aggregatedText || STREAM_TIMEOUT_MESSAGE;

      const baseMeta = streamSession.cacheCandidateMeta
        ? { ...streamSession.cacheCandidateMeta }
        : resposta?.usage || resposta?.modelo
        ? {
            ...(resposta.usage ? { usage: resposta.usage } : {}),
            ...(resposta.modelo ? { modelo: resposta.modelo } : {}),
          }
        : null;

      const doneAt = now();
      const fallbackDone: Record<string, unknown> = {
        type: "done",
        meta: baseMeta ?? {},
        content: finalRaw,
        at: doneAt,
        sinceStartMs: doneAt - t0,
        timings:
          streamSession.cacheCandidateTimings ??
          (resposta as any)?.timings ??
          streamSession.latestTimings ??
          null,
      };

      if (debugRequested) {
        fallbackDone.trace = activationTracer.snapshot();
      }

      res.status(200).json(fallbackDone);
      return;
    }

    return;
  } catch (err: any) {
    log.error("❌ Erro no /ask-eco:", {
      message: err?.message,
      stack: (err?.stack || "").split("\n").slice(0, 4).join(" ⏎ "),
    });
    const message = err?.message || "Erro interno ao processar a requisição.";
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

router.get("/debug/trace/:id", (req: express.Request, res: Response) => {
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
