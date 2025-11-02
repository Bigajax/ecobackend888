import { randomUUID } from "node:crypto";
import express, { type Response } from "express";

import { extractSessionMeta } from "./sessionMeta";
import {
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
  type CachedResponsePayload,
} from "./askEco/cache";
import { STREAM_TIMEOUT_MESSAGE, StreamSession } from "./askEco/streaming";
import { AskEcoRequestError } from "./askEco/errors";

const router = express.Router();

const MIN_SIMULATED_SEGMENTS = 5;
const MAX_SIMULATED_SEGMENTS = 15;
const FALLBACK_SIMULATED_TEXT =
  "Simulação de resposta do Eco. Este fluxo local garante segurança e consistência.";

type SimulatedSegment = { index: number; text: string };

const sanitizeSegment = (text: string) =>
  text.replace(/\r/g, " ").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

const buildSimulatedSegments = (source: string): string[] => {
  const sanitizedSource = sanitizeSegment(source);
  const baseText = sanitizedSource.length > 0 ? sanitizedSource : FALLBACK_SIMULATED_TEXT;
  const words = baseText.split(" ");
  const desiredSegments = Math.min(
    MAX_SIMULATED_SEGMENTS,
    Math.max(MIN_SIMULATED_SEGMENTS, Math.ceil(words.length / 12))
  );

  if (words.length === 0) {
    return Array.from({ length: desiredSegments }, (_, index) =>
      sanitizeSegment(`${FALLBACK_SIMULATED_TEXT} (${index + 1}/${desiredSegments})`)
    );
  }

  const segments: string[] = [];
  for (let i = 0; i < desiredSegments; i += 1) {
    const start = Math.floor((words.length * i) / desiredSegments);
    const end = Math.floor((words.length * (i + 1)) / desiredSegments);
    const slice = words.slice(start, Math.max(end, start + 1));
    const joined = sanitizeSegment(slice.join(" "));
    segments.push(joined || sanitizeSegment(`${baseText} (${i + 1}/${desiredSegments})`));
  }

  return segments.slice(0, MAX_SIMULATED_SEGMENTS);
};

function* createSimulatedSegmentGenerator(source: string): Generator<SimulatedSegment> {
  const segments = buildSimulatedSegments(source);
  for (let index = 0; index < segments.length; index += 1) {
    yield { index, text: segments[index] };
  }
}

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
  const headerStreamId = req.get("X-Stream-Id");
  const streamId =
    typeof headerStreamId === "string" && headerStreamId.trim()
      ? headerStreamId.trim()
      : randomUUID();
  const streamSession = new StreamSession({
    req,
    res,
    respondAsStream: streamPreference.respondAsStream,
    activationTracer,
    startTime: t0,
    debugRequested,
    streamId,
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
      const timings = cachedPayload.timings ?? streamSession.latestTimings;
      streamSession.markLatestTimings(timings);
      streamSession.emitLatency("prompt_ready", promptReadyAt, timings);
      const firstChunkAt = now();
      streamSession.emitLatency("ttfb", firstChunkAt, timings);
      const cacheText =
        typeof cachedPayload.raw === "string" ? cachedPayload.raw : "";
      if (cacheText.length > 0) {
        streamSession.aggregatedText = cacheText;
        streamSession.chunkReceived = true;
        streamSession.lastChunkIndex = 0;
        streamSession.dispatchEvent({ type: "message", index: 0, text: cacheText });
      } else {
        streamSession.aggregatedText = "";
        streamSession.chunkReceived = false;
        streamSession.lastChunkIndex = -1;
      }
      const doneAt = now();
      streamSession.emitLatency("ttlc", doneAt, timings);
      streamSession.dispatchEvent({ type: "done" });
      streamSession.end();
      return;
    }

    activationTracer.markCache("miss");
    log.info("// LATENCY: cache-miss", { userId: pipelineUserId, cacheKey });
    if (trimmedUltimaMsg.length >= 6) {
      try {
        await getEmbeddingCached(trimmedUltimaMsg, "entrada_usuario");
      } catch (error: any) {
        log.warn("⚠️ Falha ao aquecer cache de embedding:", error?.message ?? error);
      }
    }

    const simulatedSource = trimmedUltimaMsg || ultimaMsg;
    const aggregatedSegments: string[] = [];
    if (!promptReadyImmediate) {
      const promptReadyAt = now();
      streamSession.emitLatency("prompt_ready", promptReadyAt, streamSession.latestTimings);
    }

    for (const segment of createSimulatedSegmentGenerator(simulatedSource)) {
      if (!segment.text) {
        continue;
      }
      if (!streamSession.chunkReceived) {
        const firstChunkAt = now();
        streamSession.emitLatency("ttfb", firstChunkAt, streamSession.latestTimings);
      }
      streamSession.aggregatedText = streamSession.aggregatedText
        ? `${streamSession.aggregatedText} ${segment.text}`
        : segment.text;
      streamSession.chunkReceived = true;
      streamSession.lastChunkIndex = segment.index;
      aggregatedSegments.push(segment.text);
      streamSession.dispatchEvent({ type: "message", index: segment.index, text: segment.text });
    }

    const simulatedRaw = aggregatedSegments.join(" ");
    const doneAt = now();
    streamSession.emitLatency("ttlc", doneAt, streamSession.latestTimings);
    const simulatedMeta: Record<string, unknown> = {
      modelo: "eco-local-simulado",
      origem: "local_generator",
    };
    streamSession.cacheCandidateMeta = simulatedMeta;
    streamSession.cacheCandidateTimings = streamSession.latestTimings;
    streamSession.dispatchEvent({ type: "done" });
    streamSession.clearTimeoutGuard();
    streamSession.end();

    if (!streamSession.respondAsStream) {
      const events = Array.isArray(streamSession.offlineEvents)
        ? streamSession.offlineEvents
        : [];
      const doneEvent = [...events].reverse().find((entry) => entry.type === "done");

      const finalRaw =
        simulatedRaw && simulatedRaw.length > 0
          ? simulatedRaw
          : streamSession.aggregatedText || STREAM_TIMEOUT_MESSAGE;

      if (doneEvent) {
        const baseMeta = streamSession.cacheCandidateMeta
          ? { ...streamSession.cacheCandidateMeta }
          : simulatedMeta;

        const doneAt = now();
        const fallbackDone: Record<string, unknown> = {
          type: "done",
          meta: baseMeta ?? {},
          content: finalRaw,
          at: doneAt,
          sinceStartMs: doneAt - t0,
          timings:
            streamSession.cacheCandidateTimings ?? streamSession.latestTimings ?? null,
        };

        if (debugRequested) {
          fallbackDone.trace = activationTracer.snapshot();
        }
        res.status(200).json({ ...fallbackDone, done: true, message: finalRaw });
        return;
      }

      const baseMeta = streamSession.cacheCandidateMeta
        ? { ...streamSession.cacheCandidateMeta }
        : simulatedMeta;

      const doneAt = now();
      const fallbackDone: Record<string, unknown> = {
        type: "done",
        meta: baseMeta ?? {},
        content: finalRaw,
        at: doneAt,
        sinceStartMs: doneAt - t0,
        timings:
          streamSession.cacheCandidateTimings ?? streamSession.latestTimings ?? null,
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
        const anyRes = res as any;
        const nextId = typeof anyRes.__sseNextId === "number" ? anyRes.__sseNextId : 0;
        const errorFrame =
          `id: ${nextId}\n` + `event: error\n` + `data: ${JSON.stringify({ error: message })}\n\n`;
        anyRes.__sseNextId = nextId + 1;
        const doneFrame =
          `id: ${anyRes.__sseNextId}\n` + `event: done\n` + `data: {"done":true}\n\n`;
        anyRes.__sseNextId += 1;
        anyRes.write?.(errorFrame);
        anyRes.write?.(doneFrame);
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
