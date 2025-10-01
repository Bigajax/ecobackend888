// routes/openrouterRoutes.ts
import crypto from "node:crypto";
import express, { type Request, type Response } from "express";
import { supabase } from "../lib/supabaseAdmin"; // ✅ usa a instância (não é função)

import {
  getEcoResponse,
  buildFinalizedStreamText,
  type EcoStreamHandler,
  type EcoLatencyMarks,
} from "../services/ConversationOrchestrator";
import type { GetEcoResult } from "../utils";
import { embedTextoCompleto } from "../adapters/embeddingService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias";
import { extractSessionMeta } from "./sessionMeta";
import { trackEcoCache, trackMensagemRecebida } from "../analytics/events/mixpanelEvents";

// montar contexto e log
import { ContextBuilder } from "../services/promptContext";
import { log, isDebug } from "../services/promptContext/logger";
import { now } from "../utils";
import { RESPONSE_CACHE } from "../services/CacheService";

const CACHE_TTL_MS = 60_000;

type CachedResponsePayload = {
  raw: string;
  meta?: Record<string, any> | null;
  modelo?: string | null;
  usage?: unknown;
  timings?: EcoLatencyMarks;
};

const buildResponseCacheKey = (userId: string, ultimaMsg: string) => {
  const hash = crypto
    .createHash("sha1")
    .update(`${userId}:${ultimaMsg}`)
    .digest("hex");
  return `resp:user:${userId}:${hash}`;
};

const router = express.Router();

// log seguro
const safeLog = (s: string) =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";

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

router.post("/ask-eco", async (req: Request, res: Response) => {
  const t0 = now();
  const { usuario_id, nome_usuario } = req.body;
  const mensagensParaIA = normalizarMensagens(req.body);
  const streamingRes = res as Response & { flush?: () => void; flushHeaders?: () => void };
  let sseStarted = false;
  let streamClosed = false;
  let sendSseRef: ((payload: Record<string, unknown>) => void) | null = null;

  // auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }
  const token = authHeader.replace("Bearer ", "").trim();

  if (!usuario_id || !mensagensParaIA) {
    return res.status(400).json({ error: "usuario_id e messages são obrigatórios." });
  }

  try {
    // ✅ NÃO chamar como função: o cliente já é a instância
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Token inválido ou usuário não encontrado." });
    }

    const sessionMeta = extractSessionMeta(req.body);

    let latestTimings: EcoLatencyMarks | undefined;
    let firstChunkLogged = false;
    let cacheKey: string | null = null;
    let cacheable = true;
    let cacheCandidateMeta: Record<string, any> | null = null;
    let cacheCandidateTimings: EcoLatencyMarks | undefined;
    let clientDisconnected = false;

    const startSse = () => {
      if (sseStarted) return;
      sseStarted = true;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream"); // LATENCY: formato SSE imediato.
      res.setHeader("Cache-Control", "no-cache"); // LATENCY: evita buffering no cliente.
      res.setHeader("Connection", "keep-alive"); // LATENCY: mantém socket aberto.
      streamingRes.flushHeaders?.(); // LATENCY: envia cabeçalhos sem aguardar payload.
      streamingRes.flush?.(); // LATENCY: força o envio imediato do preâmbulo.
    };

    const sendSse = (payload: Record<string, unknown>) => {
      if (streamClosed) return;
      startSse();
      streamingRes.write(`data: ${JSON.stringify(payload)}\n\n`); // LATENCY: chunk incremental da resposta.
      streamingRes.flush?.(); // LATENCY: garante entrega sem buffering adicional.
    };
    sendSseRef = sendSse;

    const emitLatency = (
      stage: "prompt_ready" | "ttfb" | "ttlc",
      at: number,
      timings?: EcoLatencyMarks
    ) => {
      const sinceStartMs = at - t0;
      log.info(`// LATENCY: ${stage}`, {
        at,
        sinceStartMs,
        timings,
      });
      sendSse({ type: "latency", stage, at, sinceStartMs, timings });
    };

    startSse();

    req.on("close", () => {
      if (!streamClosed) {
        clientDisconnected = true;
      }
      streamClosed = true;
    });

    const ultimaMsg = String(mensagensParaIA.at(-1)?.content ?? "");
    log.info("🗣️ Última mensagem:", safeLog(ultimaMsg));

    trackMensagemRecebida({
      distinctId: sessionMeta?.distinctId,
      userId: usuario_id,
      origem: "texto",
      tipo: getMensagemTipo(mensagensParaIA),
      tamanhoCaracteres: ultimaMsg.length,
      timestamp: new Date().toISOString(),
      sessaoId: sessionMeta?.sessaoId ?? null,
      origemSessao: sessionMeta?.origem ?? null,
    });

    cacheKey = buildResponseCacheKey(usuario_id, ultimaMsg);
    let cachedPayload: CachedResponsePayload | null = null;
    if (cacheKey) {
      const cachedRaw = RESPONSE_CACHE.get(cacheKey);
      if (cachedRaw) {
        try {
          cachedPayload = JSON.parse(cachedRaw) as CachedResponsePayload;
        } catch (parseErr) {
          log.warn("⚠️ Falha ao parsear RESPONSE_CACHE:", {
            cacheKey,
            error: (parseErr as Error)?.message,
          });
          RESPONSE_CACHE.delete(cacheKey);
        }
      }
    }

    const isRecord = (value: unknown): value is Record<string, any> =>
      typeof value === "object" && value !== null;

    if (cachedPayload && typeof cachedPayload.raw === "string") {
      if (!cachedPayload.raw.includes("```json")) {
        const metaSource = isRecord(cachedPayload.meta) ? cachedPayload.meta : {};
        const normalizedResult: GetEcoResult = {
          message: cachedPayload.raw,
        };

        if (typeof metaSource.intensidade === "number") {
          normalizedResult.intensidade = metaSource.intensidade;
        }
        if (typeof metaSource.resumo === "string" && metaSource.resumo.trim()) {
          normalizedResult.resumo = metaSource.resumo;
        }
        if (typeof metaSource.emocao === "string" && metaSource.emocao.trim()) {
          normalizedResult.emocao = metaSource.emocao;
        }
        if (Array.isArray(metaSource.tags)) {
          normalizedResult.tags = metaSource.tags.filter(
            (tag): tag is string => typeof tag === "string"
          );
        }
        if (
          typeof metaSource.categoria === "string" ||
          metaSource.categoria === null
        ) {
          normalizedResult.categoria = metaSource.categoria ?? null;
        }
        if (metaSource.proactive !== undefined) {
          normalizedResult.proactive =
            typeof metaSource.proactive === "object" || metaSource.proactive === null
              ? (metaSource.proactive as GetEcoResult["proactive"])
              : null;
        }

        const rebuiltRaw = buildFinalizedStreamText(normalizedResult);
        let normalizedMeta: Record<string, any> | null = isRecord(cachedPayload.meta)
          ? { ...cachedPayload.meta }
          : null;
        if (normalizedMeta) {
          normalizedMeta.length = rebuiltRaw.length;
        } else {
          normalizedMeta = { length: rebuiltRaw.length };
        }

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
      log.info("// LATENCY: cache-hit", { userId: usuario_id, cacheKey });
      trackEcoCache({
        distinctId: sessionMeta?.distinctId,
        userId: usuario_id,
        status: "hit",
        key: cacheKey ?? undefined,
        source: "openrouter",
      });
      latestTimings = cachedPayload.timings ?? latestTimings;
      emitLatency("prompt_ready", promptReadyAt, latestTimings);
      sendSse({
        type: "prompt_ready",
        at: promptReadyAt,
        sinceStartMs: promptReadyAt - t0,
        timings: latestTimings,
      });
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
      sendSse({
        type: "done",
        meta: { ...doneMetaBase, cache: true },
        at: doneAt,
        sinceStartMs: doneAt - t0,
        timings: latestTimings,
      });
      if (!streamClosed) {
        streamClosed = true;
        streamingRes.end();
      }
      return;
    }

    if (cacheKey) {
      log.info("// LATENCY: cache-miss", { userId: usuario_id, cacheKey });
      trackEcoCache({
        distinctId: sessionMeta?.distinctId,
        userId: usuario_id,
        status: "miss",
        key: cacheKey,
        source: "openrouter",
      });
    }

    const sendErrorAndEnd = (message: string) => {
      cacheable = false;
      sendSse({ type: "error", message });
      if (!streamClosed) {
        streamClosed = true;
        streamingRes.end(); // LATENCY: encerra imediatamente o fluxo SSE.
      }
    };

    // embedding opcional (garante number[])
    let queryEmbedding: number[] | undefined;
    if (ultimaMsg.trim().length >= 6) {
      try {
        const raw = await embedTextoCompleto(ultimaMsg);
        const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
        if (Array.isArray(arr)) {
          const coerced = (arr as unknown[]).map((v) => Number(v));
          if (!coerced.some((n) => Number.isNaN(n))) {
            queryEmbedding = coerced;
          }
        }
      } catch (e) {
        log.warn("⚠️ Falha ao gerar embedding:", (e as Error)?.message);
      }
    }

    // threshold adaptativo
    let threshold = 0.15;
    if (ultimaMsg.trim().length < 20) threshold = 0.1;
    if (/lembr|record|memó/i.test(ultimaMsg)) threshold = Math.min(threshold, 0.12);

    // memórias
    let memsSimilares: any[] = [];
    try {
      memsSimilares = await buscarMemoriasSemelhantes(usuario_id, {
        userEmbedding: queryEmbedding,
        texto: queryEmbedding ? undefined : ultimaMsg,
        k: 4, // LATENCY: top_k
        threshold,
      });
      log.info(
        "🔎 Memórias similares:",
        memsSimilares.map((m) => ({
          id: typeof m.id === "string" ? m.id.slice(0, 8) : m.id,
          sim: m.similaridade ?? m.similarity ?? 0,
        }))
      );
    } catch (memErr) {
      log.warn("⚠️ Falha na busca de memórias semelhantes:", (memErr as Error)?.message);
      memsSimilares = [];
    }

    // ===== monta contexto com ContextBuilder (sem 'new') =====
    const buildIn = {
      userId: usuario_id,
      texto: ultimaMsg,
      perfil: req.body?.perfil ?? null,
      heuristicas: req.body?.heuristicas ?? null,
      mems: memsSimilares,
      blocoTecnicoForcado: req.body?.blocoTecnicoForcado ?? null,
      forcarMetodoViva: req.body?.forcarMetodoViva ?? false,
      aberturaHibrida: req.body?.aberturaHibrida ?? null,
    };
    const contexto = await ContextBuilder.build(buildIn);
    const prompt = contexto.montarMensagemAtual(ultimaMsg);

    if (isDebug()) {
      log.debug("[ask-eco] Contexto montado", {
        promptLen: typeof prompt === "string" ? prompt.length : -1,
      });
    }

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
            sendSse({
              type: "prompt_ready",
              at,
              sinceStartMs: at - t0,
              timings: latestTimings,
            });
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
            sendSse({
              type: "done",
              meta: event.meta ?? {},
              at,
              sinceStartMs: at - t0,
              timings: latestTimings,
            });
            if (!streamClosed) {
              streamClosed = true;
              streamingRes.end(); // LATENCY: encerra o SSE logo após o sinal de conclusão.
            }
          }
        }
      },
    };

    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token,
      mems: memsSimilares,
      promptOverride: prompt, // <- string
      sessionMeta,
      stream: streamHandler,
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
      sendSse({
        type: "done",
        meta: fallbackMeta,
        at,
        sinceStartMs: at - t0,
        timings: latestTimings,
      });
      streamClosed = true;
      streamingRes.end();
    }

    const shouldStore =
      Boolean(cacheKey) &&
      cacheable &&
      !clientDisconnected &&
      typeof resposta?.raw === "string" &&
      resposta.raw.length > 0;

    if (shouldStore && cacheKey) {
      const metaFromDone = cacheCandidateMeta
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
          (metaRecord && Object.prototype.hasOwnProperty.call(metaRecord, "usage")
            ? metaRecord.usage
            : undefined),
        timings: cacheCandidateTimings ?? resposta?.timings,
      };

      try {
        RESPONSE_CACHE.set(cacheKey, JSON.stringify(payload), CACHE_TTL_MS); // LATENCY: cache-store
        log.info("// LATENCY: cache-store", {
          cacheKey,
          userId: usuario_id,
          length: resposta.raw.length,
        });
      } catch (cacheErr) {
        log.warn("⚠️ Falha ao salvar RESPONSE_CACHE:", (cacheErr as Error)?.message);
      }
    }

    return;
  } catch (err: any) {
    log.error("❌ Erro no /ask-eco:", { message: err?.message, stack: err?.stack });
    const message = err?.message || "Erro interno ao processar a requisição.";
    if (sseStarted || res.headersSent) {
      sendSseRef?.({ type: "error", message });
      if (!streamClosed) {
        streamClosed = true;
        streamingRes.end();
      }
      return;
    }
    return res.status(500).json({
      error: "Erro interno ao processar a requisição.",
      details: { message: err?.message, stack: err?.stack },
    });
  }
});

export default router;
