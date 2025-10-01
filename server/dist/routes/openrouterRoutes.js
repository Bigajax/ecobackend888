"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// routes/openrouterRoutes.ts
const node_crypto_1 = __importDefault(require("node:crypto"));
const express_1 = __importDefault(require("express"));
const supabaseAdmin_1 = require("../lib/supabaseAdmin"); // ✅ usa a instância (não é função)
const ConversationOrchestrator_1 = require("../services/ConversationOrchestrator");
const embeddingService_1 = require("../adapters/embeddingService");
const buscarMemorias_1 = require("../services/buscarMemorias");
const sessionMeta_1 = require("./sessionMeta");
const mixpanelEvents_1 = require("../analytics/events/mixpanelEvents");
// montar contexto e log
const promptContext_1 = require("../services/promptContext");
const logger_1 = require("../services/promptContext/logger");
const utils_1 = require("../utils");
const CacheService_1 = require("../services/CacheService");
const CACHE_TTL_MS = 60_000;
const buildResponseCacheKey = (userId, ultimaMsg) => {
    const hash = node_crypto_1.default
        .createHash("sha1")
        .update(`${userId}:${ultimaMsg}`)
        .digest("hex");
    return `resp:user:${userId}:${hash}`;
};
const router = express_1.default.Router();
// log seguro
const safeLog = (s) => process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";
const getMensagemTipo = (mensagens) => {
    if (!Array.isArray(mensagens) || mensagens.length === 0)
        return "inicial";
    if (mensagens.length === 1)
        return mensagens[0]?.role === "assistant" ? "continuacao" : "inicial";
    let previousUserMessages = 0;
    for (let i = 0; i < mensagens.length - 1; i += 1) {
        const role = mensagens[i]?.role;
        if (role === "assistant")
            return "continuacao";
        if (role === "user")
            previousUserMessages += 1;
    }
    return previousUserMessages > 0 ? "continuacao" : "inicial";
};
// normalizador
function normalizarMensagens(body) {
    const { messages, mensagens, mensagem } = body || {};
    if (Array.isArray(messages))
        return messages;
    if (Array.isArray(mensagens))
        return mensagens;
    if (mensagem)
        return [{ role: "user", content: mensagem }];
    return null;
}
router.post("/ask-eco", async (req, res) => {
    const t0 = (0, utils_1.now)();
    const { usuario_id, nome_usuario } = req.body;
    const mensagensParaIA = normalizarMensagens(req.body);
    const streamingRes = res;
    let sseStarted = false;
    let streamClosed = false;
    let sendSseRef = null;
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
        const { data, error } = await supabaseAdmin_1.supabase.auth.getUser(token);
        if (error || !data?.user) {
            return res.status(401).json({ error: "Token inválido ou usuário não encontrado." });
        }
        const sessionMeta = (0, sessionMeta_1.extractSessionMeta)(req.body);
        let latestTimings;
        let firstChunkLogged = false;
        let cacheKey = null;
        let cacheable = true;
        let cacheCandidateMeta = null;
        let cacheCandidateTimings;
        let clientDisconnected = false;
        const startSse = () => {
            if (sseStarted)
                return;
            sseStarted = true;
            res.status(200);
            res.setHeader("Content-Type", "text/event-stream"); // LATENCY: formato SSE imediato.
            res.setHeader("Cache-Control", "no-cache"); // LATENCY: evita buffering no cliente.
            res.setHeader("Connection", "keep-alive"); // LATENCY: mantém socket aberto.
            streamingRes.flushHeaders?.(); // LATENCY: envia cabeçalhos sem aguardar payload.
            streamingRes.flush?.(); // LATENCY: força o envio imediato do preâmbulo.
        };
        const sendSse = (payload) => {
            if (streamClosed)
                return;
            startSse();
            streamingRes.write(`data: ${JSON.stringify(payload)}\n\n`); // LATENCY: chunk incremental da resposta.
            streamingRes.flush?.(); // LATENCY: garante entrega sem buffering adicional.
        };
        sendSseRef = sendSse;
        const emitLatency = (stage, at, timings) => {
            const sinceStartMs = at - t0;
            logger_1.log.info(`// LATENCY: ${stage}`, {
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
        logger_1.log.info("🗣️ Última mensagem:", safeLog(ultimaMsg));
        (0, mixpanelEvents_1.trackMensagemRecebida)({
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
        let cachedPayload = null;
        if (cacheKey) {
            const cachedRaw = CacheService_1.RESPONSE_CACHE.get(cacheKey);
            if (cachedRaw) {
                try {
                    cachedPayload = JSON.parse(cachedRaw);
                }
                catch (parseErr) {
                    logger_1.log.warn("⚠️ Falha ao parsear RESPONSE_CACHE:", {
                        cacheKey,
                        error: parseErr?.message,
                    });
                    CacheService_1.RESPONSE_CACHE.delete(cacheKey);
                }
            }
        }
        const isRecord = (value) => typeof value === "object" && value !== null;
        if (cachedPayload && typeof cachedPayload.raw === "string") {
            if (!cachedPayload.raw.includes("```json")) {
                const metaSource = isRecord(cachedPayload.meta) ? cachedPayload.meta : {};
                const normalizedResult = {
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
                    normalizedResult.tags = metaSource.tags.filter((tag) => typeof tag === "string");
                }
                if (typeof metaSource.categoria === "string" ||
                    metaSource.categoria === null) {
                    normalizedResult.categoria = metaSource.categoria ?? null;
                }
                if (metaSource.proactive !== undefined) {
                    normalizedResult.proactive =
                        typeof metaSource.proactive === "object" || metaSource.proactive === null
                            ? metaSource.proactive
                            : null;
                }
                const rebuiltRaw = (0, ConversationOrchestrator_1.buildFinalizedStreamText)(normalizedResult);
                let normalizedMeta = isRecord(cachedPayload.meta)
                    ? { ...cachedPayload.meta }
                    : null;
                if (normalizedMeta) {
                    normalizedMeta.length = rebuiltRaw.length;
                }
                else {
                    normalizedMeta = { length: rebuiltRaw.length };
                }
                const updatedPayload = {
                    ...cachedPayload,
                    raw: rebuiltRaw,
                    meta: normalizedMeta,
                };
                cachedPayload = updatedPayload;
                if (cacheKey) {
                    try {
                        CacheService_1.RESPONSE_CACHE.set(cacheKey, JSON.stringify(updatedPayload), CACHE_TTL_MS);
                    }
                    catch (cacheErr) {
                        logger_1.log.warn("⚠️ Falha ao atualizar RESPONSE_CACHE legado:", {
                            cacheKey,
                            error: cacheErr?.message,
                        });
                    }
                }
            }
            const promptReadyAt = (0, utils_1.now)();
            logger_1.log.info("// LATENCY: cache-hit", { userId: usuario_id, cacheKey });
            (0, mixpanelEvents_1.trackEcoCache)({
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
            const firstChunkAt = (0, utils_1.now)();
            firstChunkLogged = true;
            emitLatency("ttfb", firstChunkAt, latestTimings);
            sendSse({ type: "chunk", delta: cachedPayload.raw, index: 0, cache: true });
            const doneAt = (0, utils_1.now)();
            emitLatency("ttlc", doneAt, latestTimings);
            const doneMetaBase = cachedPayload.meta ?? {
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
            logger_1.log.info("// LATENCY: cache-miss", { userId: usuario_id, cacheKey });
            (0, mixpanelEvents_1.trackEcoCache)({
                distinctId: sessionMeta?.distinctId,
                userId: usuario_id,
                status: "miss",
                key: cacheKey,
                source: "openrouter",
            });
        }
        const sendErrorAndEnd = (message) => {
            cacheable = false;
            sendSse({ type: "error", message });
            if (!streamClosed) {
                streamClosed = true;
                streamingRes.end(); // LATENCY: encerra imediatamente o fluxo SSE.
            }
        };
        // embedding opcional (garante number[])
        let queryEmbedding;
        if (ultimaMsg.trim().length >= 6) {
            try {
                const raw = await (0, embeddingService_1.embedTextoCompleto)(ultimaMsg);
                const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
                if (Array.isArray(arr)) {
                    const coerced = arr.map((v) => Number(v));
                    if (!coerced.some((n) => Number.isNaN(n))) {
                        queryEmbedding = coerced;
                    }
                }
            }
            catch (e) {
                logger_1.log.warn("⚠️ Falha ao gerar embedding:", e?.message);
            }
        }
        // threshold adaptativo
        let threshold = 0.15;
        if (ultimaMsg.trim().length < 20)
            threshold = 0.1;
        if (/lembr|record|memó/i.test(ultimaMsg))
            threshold = Math.min(threshold, 0.12);
        // memórias
        let memsSimilares = [];
        try {
            memsSimilares = await (0, buscarMemorias_1.buscarMemoriasSemelhantes)(usuario_id, {
                userEmbedding: queryEmbedding,
                texto: queryEmbedding ? undefined : ultimaMsg,
                k: 4, // LATENCY: top_k
                threshold,
            });
            logger_1.log.info("🔎 Memórias similares:", memsSimilares.map((m) => ({
                id: typeof m.id === "string" ? m.id.slice(0, 8) : m.id,
                sim: m.similaridade ?? m.similarity ?? 0,
            })));
        }
        catch (memErr) {
            logger_1.log.warn("⚠️ Falha na busca de memórias semelhantes:", memErr?.message);
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
        const contexto = await promptContext_1.ContextBuilder.build(buildIn);
        const prompt = contexto.montarMensagemAtual(ultimaMsg);
        if ((0, logger_1.isDebug)()) {
            logger_1.log.debug("[ask-eco] Contexto montado", {
                promptLen: typeof prompt === "string" ? prompt.length : -1,
            });
        }
        let doneNotified = false;
        const streamHandler = {
            async onEvent(event) {
                if (event.type === "chunk") {
                    if (!firstChunkLogged) {
                        firstChunkLogged = true;
                        const at = (0, utils_1.now)();
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
                        const at = (0, utils_1.now)();
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
                        const at = (0, utils_1.now)();
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
        const resposta = await (0, ConversationOrchestrator_1.getEcoResponse)({
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
                        logger_1.log.warn("⚠️ Pós-processamento /ask-eco falhou:", result.reason);
                    }
                });
            })
                .catch((finalErr) => {
                logger_1.log.warn("⚠️ Pós-processamento /ask-eco rejeitado:", finalErr);
            });
        });
        if (!doneNotified && !streamClosed) {
            const at = (0, utils_1.now)();
            const fallbackTimings = resposta?.timings ?? latestTimings;
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
        const shouldStore = Boolean(cacheKey) &&
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
            const metaRecord = metaFromDone;
            const payload = {
                raw: resposta.raw,
                meta: metaFromDone,
                modelo: resposta?.modelo ??
                    (typeof metaRecord?.modelo === "string" ? metaRecord.modelo : null),
                usage: resposta?.usage ??
                    (metaRecord && Object.prototype.hasOwnProperty.call(metaRecord, "usage")
                        ? metaRecord.usage
                        : undefined),
                timings: cacheCandidateTimings ?? resposta?.timings,
            };
            try {
                CacheService_1.RESPONSE_CACHE.set(cacheKey, JSON.stringify(payload), CACHE_TTL_MS); // LATENCY: cache-store
                logger_1.log.info("// LATENCY: cache-store", {
                    cacheKey,
                    userId: usuario_id,
                    length: resposta.raw.length,
                });
            }
            catch (cacheErr) {
                logger_1.log.warn("⚠️ Falha ao salvar RESPONSE_CACHE:", cacheErr?.message);
            }
        }
        return;
    }
    catch (err) {
        logger_1.log.error("❌ Erro no /ask-eco:", { message: err?.message, stack: err?.stack });
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
exports.default = router;
//# sourceMappingURL=openrouterRoutes.js.map