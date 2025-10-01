"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFinalizedStreamText = buildFinalizedStreamText;
exports.getEcoResponse = getEcoResponse;
exports.getEcoResponseOtimizado = getEcoResponse;
exports.getEcoResponse = getEcoResponse;
exports.getEcoResponseOtimizado = getEcoResponse;
// server/services/ConversationOrchestrator.ts
const utils_1 = require("../utils");
const SupabaseAdapter_1 = require("../adapters/SupabaseAdapter");
const ResponseGenerator_1 = require("../core/ResponseGenerator");
const ClaudeAdapter_1 = require("../core/ClaudeAdapter");
const logger_1 = require("../services/promptContext/logger");
const derivadosService_1 = require("../services/derivadosService");
const CacheService_1 = require("./CacheService");
const greeting_1 = require("./conversation/greeting");
const router_1 = require("./conversation/router");
const parallelFetch_1 = require("./conversation/parallelFetch");
const contextCache_1 = require("./conversation/contextCache");
const responseFinalizer_1 = require("./conversation/responseFinalizer");
const helpers_1 = require("./conversation/helpers");
const fastLane_1 = require("./conversation/fastLane");
const promptPlan_1 = require("./conversation/promptPlan");
function buildFinalizedStreamText(result) {
    const payload = {
        intensidade: result.intensidade ?? null,
        resumo: result.resumo ?? null,
        emocao: result.emocao ?? null,
        tags: Array.isArray(result.tags) ? result.tags : [],
        categoria: result.categoria ?? null,
        proactive: result.proactive ?? null,
    };
    return `${result.message ?? ""}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}
/* ---------------------------- Consts ---------------------------- */
const DERIVADOS_TIMEOUT_MS = Number(process.env.ECO_DERIVADOS_TIMEOUT_MS ?? 600);
const PARALELAS_TIMEOUT_MS = Number(process.env.ECO_PARALELAS_TIMEOUT_MS ?? 180);
/* -------------------------- Orquestrador ------------------------ */
async function getEcoResponse({ messages, userId, userName, accessToken, mems = [], forcarMetodoViva = false, blocoTecnicoForcado = null, clientHour, promptOverride, metaFromBuilder, sessionMeta, stream, }) {
    (0, utils_1.ensureEnvs)();
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Parâmetro "messages" vazio ou inválido.');
    }
    const thread = messages;
    const lastMessage = thread.at(-1);
    const lastMessageId = lastMessage?.id;
    const ultimaMsg = lastMessage?.content ?? "";
    const streamHandler = stream ?? null;
    const timings = {};
    const emitStream = async (event) => {
        if (!streamHandler)
            return;
        // LATENCY: propaga eventos de streaming imediatamente para a camada HTTP.
        await streamHandler.onEvent(event);
    };
    const supabase = (0, SupabaseAdapter_1.supabaseWithBearer)(accessToken);
    const hasAssistantBeforeInThread = thread
        .slice(0, -1)
        .some((msg) => (0, utils_1.mapRoleForOpenAI)(msg.role) === "assistant");
    // Micro-resposta local
    const micro = (0, ResponseGenerator_1.microReflexoLocal)(ultimaMsg);
    if (micro) {
        const startedAt = (0, utils_1.now)();
        const finalized = await responseFinalizer_1.defaultResponseFinalizer.finalize({
            raw: micro,
            ultimaMsg,
            userName,
            hasAssistantBefore: hasAssistantBeforeInThread,
            userId,
            supabase,
            lastMessageId: lastMessageId ?? undefined,
            mode: "fast",
            startedAt,
            usageTokens: undefined,
            modelo: "micro-reflexo",
            sessionMeta,
            sessaoId: sessionMeta?.sessaoId ?? undefined,
            origemSessao: sessionMeta?.origem ?? undefined,
        });
        const finalText = buildFinalizedStreamText(finalized);
        if (streamHandler) {
            await emitStream({ type: "control", name: "prompt_ready" });
            await emitStream({ type: "control", name: "first_token" });
            await emitStream({ type: "chunk", content: finalText, index: 0 });
            await emitStream({
                type: "control",
                name: "done",
                meta: { length: finalText.length, modelo: "micro-reflexo" },
            });
            const finalize = async () => finalized;
            return {
                raw: finalText,
                modelo: "micro-reflexo",
                usage: undefined,
                finalize,
                timings: {},
            };
        }
        return finalized;
    }
    // Pipeline de saudação
    const greetingResult = greeting_1.defaultGreetingPipeline.handle({
        messages: thread,
        ultimaMsg,
        userId,
        userName,
        clientHour,
        greetingEnabled: process.env.ECO_GREETING_BACKEND_ENABLED !== "0",
    });
    if (greetingResult.handled && greetingResult.response) {
        const startedAt = (0, utils_1.now)();
        const finalized = await responseFinalizer_1.defaultResponseFinalizer.finalize({
            raw: greetingResult.response,
            ultimaMsg,
            userName,
            hasAssistantBefore: hasAssistantBeforeInThread,
            userId,
            supabase,
            lastMessageId: lastMessageId ?? undefined,
            mode: "fast",
            startedAt,
            usageTokens: undefined,
            modelo: "greeting",
            sessionMeta,
            sessaoId: sessionMeta?.sessaoId ?? undefined,
            origemSessao: sessionMeta?.origem ?? undefined,
        });
        const finalText = buildFinalizedStreamText(finalized);
        if (streamHandler) {
            await emitStream({ type: "control", name: "prompt_ready" });
            await emitStream({ type: "control", name: "first_token" });
            await emitStream({ type: "chunk", content: finalText, index: 0 });
            await emitStream({
                type: "control",
                name: "done",
                meta: { length: finalText.length, modelo: "greeting" },
            });
            const finalize = async () => finalized;
            return {
                raw: finalText,
                modelo: "greeting",
                usage: undefined,
                finalize,
                timings: {},
            };
        }
        return finalized;
    }
    // Roteamento
    const decision = router_1.defaultConversationRouter.decide({
        messages: thread,
        ultimaMsg,
        forcarMetodoViva,
        promptOverride,
    });
    if ((0, logger_1.isDebug)()) {
        logger_1.log.debug("[Orchestrator] flags", {
            promptOverrideLen: (promptOverride || "").trim().length,
            low: decision.lowComplexity,
            vivaAtivo: decision.vivaAtivo,
            nivelRoteador: decision.nivelRoteador,
            ultimaLen: (ultimaMsg || "").length,
            mode: decision.mode,
        });
    }
    // --------------------------- FAST MODE ---------------------------
    if (decision.mode === "fast" && !streamHandler) {
        const inicioFast = (0, utils_1.now)();
        const fast = await (0, fastLane_1.runFastLaneLLM)({
            messages: thread,
            userName,
            ultimaMsg,
            hasAssistantBefore: decision.hasAssistantBefore,
            userId,
            supabase,
            lastMessageId: lastMessageId ?? undefined,
            startedAt: inicioFast,
            deps: {
                claudeClient: ClaudeAdapter_1.claudeChatCompletion,
                responseFinalizer: responseFinalizer_1.defaultResponseFinalizer,
                firstName: helpers_1.firstName,
            },
            sessionMeta,
        });
        return fast.response;
    }
    // --------------------------- FULL MODE ---------------------------
    timings.contextBuildStart = (0, utils_1.now)();
    logger_1.log.info("// LATENCY: context_build_start", { at: timings.contextBuildStart });
    const shouldSkipDerivados = !!promptOverride ||
        (metaFromBuilder && Number(metaFromBuilder.nivel) === 1) ||
        !userId;
    const derivadosCacheKey = !shouldSkipDerivados && userId ? `derivados:${userId}` : null;
    const cachedDerivados = derivadosCacheKey
        ? CacheService_1.DERIVADOS_CACHE.get(derivadosCacheKey) ?? null
        : null;
    // Paralelos (heurísticas, embedding e memórias semelhantes) com guarda de timeout
    const paralelasPromise = promptOverride
        ? Promise.resolve({
            heuristicas: [],
            userEmbedding: [],
            memsSemelhantes: [],
        })
        : Promise.race([
            parallelFetch_1.defaultParallelFetchService.run({ ultimaMsg, userId, supabase }),
            (0, utils_1.sleep)(PARALELAS_TIMEOUT_MS).then(() => ({
                heuristicas: [],
                userEmbedding: [],
                memsSemelhantes: [],
            })),
        ]);
    // Derivados com cache + timeout
    const derivadosPromise = shouldSkipDerivados || cachedDerivados
        ? Promise.resolve(cachedDerivados)
        : (0, parallelFetch_1.withTimeoutOrNull)((async () => {
            try {
                const [{ data: stats }, { data: marcos }, { data: efeitos }] = await Promise.all([
                    supabase
                        .from("user_theme_stats")
                        .select("tema,freq_30d,int_media_30d")
                        .eq("user_id", userId)
                        .order("freq_30d", { ascending: false })
                        .limit(5),
                    supabase
                        .from("user_temporal_milestones")
                        .select("tema,resumo_evolucao,marco_at")
                        .eq("user_id", userId)
                        .order("marco_at", { ascending: false })
                        .limit(3),
                    supabase
                        .from("interaction_effects")
                        .select("efeito,score,created_at")
                        .eq("user_id", userId)
                        .order("created_at", { ascending: false })
                        .limit(30),
                ]);
                const arr = (efeitos || []).map((r) => ({
                    x: { efeito: r.efeito ?? "neutro" },
                }));
                const scores = (efeitos || [])
                    .map((r) => Number(r?.score))
                    .filter((v) => Number.isFinite(v));
                const media = scores.length
                    ? scores.reduce((a, b) => a + b, 0) /
                        scores.length
                    : 0;
                return (0, derivadosService_1.getDerivados)((stats || []), (marcos || []), arr, media);
            }
            catch {
                return null;
            }
        })(), DERIVADOS_TIMEOUT_MS, "derivados", { logger: logger_1.log });
    const paralelas = await paralelasPromise;
    const derivados = await derivadosPromise;
    if (derivadosCacheKey &&
        !cachedDerivados &&
        derivados &&
        typeof derivados === "object") {
        CacheService_1.DERIVADOS_CACHE.set(derivadosCacheKey, derivados);
    }
    const heuristicas = paralelas?.heuristicas ?? [];
    const userEmbedding = paralelas?.userEmbedding ?? [];
    const memsSemelhantes = paralelas?.memsSemelhantes ?? [];
    const aberturaHibrida = derivados
        ? (() => {
            try {
                return (0, derivadosService_1.insightAbertura)(derivados);
            }
            catch {
                return null;
            }
        })()
        : null;
    // System prompt final (ou override)
    const systemPrompt = promptOverride ??
        (await contextCache_1.defaultContextCache.build({
            userId,
            userName,
            perfil: null,
            mems,
            memoriasSemelhantes: memsSemelhantes,
            forcarMetodoViva: decision.vivaAtivo,
            blocoTecnicoForcado,
            texto: ultimaMsg,
            heuristicas,
            userEmbedding,
            skipSaudacao: true,
            derivados,
            aberturaHibrida,
        }));
    // Planejamento de prompt (seleção de estilo e orçamento)
    // No seu projeto, buildFullPrompt retorna { prompt: PromptMessage[], maxTokens }
    const { prompt, maxTokens } = (0, promptPlan_1.buildFullPrompt)({
        decision,
        ultimaMsg,
        systemPrompt,
        messages: thread,
    });
    timings.contextBuildEnd = (0, utils_1.now)();
    logger_1.log.info("// LATENCY: context_build_end", {
        at: timings.contextBuildEnd,
        durationMs: timings.contextBuildStart && timings.contextBuildEnd
            ? timings.contextBuildEnd - timings.contextBuildStart
            : undefined,
    });
    let inicioEco = (0, utils_1.now)();
    const principalModel = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-3-5-sonnet";
    if (streamHandler) {
        const promptReadySnapshot = { ...timings };
        await emitStream({ type: "control", name: "prompt_ready", timings: promptReadySnapshot });
        const streamedChunks = [];
        let chunkIndex = 0;
        let firstTokenSent = false;
        let usageFromStream;
        let finishReason;
        let modelFromStream;
        let streamFailure = null;
        timings.llmStart = (0, utils_1.now)();
        inicioEco = timings.llmStart;
        logger_1.log.info("// LATENCY: llm_request_start", {
            at: timings.llmStart,
            sincePromptReadyMs: timings.contextBuildEnd && timings.llmStart
                ? timings.llmStart - timings.contextBuildEnd
                : undefined,
        });
        try {
            await (0, ClaudeAdapter_1.streamClaudeChatCompletion)({
                messages: prompt,
                model: principalModel,
                temperature: 0.6,
                maxTokens,
            }, {
                async onChunk({ content }) {
                    if (!content)
                        return;
                    streamedChunks.push(content);
                    if (!firstTokenSent) {
                        firstTokenSent = true;
                        await emitStream({ type: "control", name: "first_token" });
                    }
                    const currentIndex = chunkIndex;
                    chunkIndex += 1;
                    // LATENCY: envia token incremental direto para o SSE.
                    await emitStream({ type: "chunk", content, index: currentIndex });
                },
                async onControl(event) {
                    if (event.type === "reconnect") {
                        await emitStream({
                            type: "control",
                            name: "reconnect",
                            attempt: event.attempt,
                        });
                        return;
                    }
                    if (event.type === "done") {
                        usageFromStream = event.usage ?? usageFromStream;
                        finishReason = event.finishReason ?? finishReason;
                        modelFromStream = event.model ?? modelFromStream;
                    }
                },
                async onError(error) {
                    streamFailure = error;
                    await emitStream({ type: "error", error });
                },
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            streamFailure = err;
        }
        finally {
            timings.llmEnd = (0, utils_1.now)();
            logger_1.log.info("// LATENCY: llm_request_end", {
                at: timings.llmEnd,
                durationMs: timings.llmStart && timings.llmEnd
                    ? timings.llmEnd - timings.llmStart
                    : undefined,
            });
        }
        if (streamFailure) {
            throw streamFailure;
        }
        const raw = streamedChunks.join("");
        let finalizePromise = null;
        const finalize = () => {
            if (!finalizePromise) {
                finalizePromise = responseFinalizer_1.defaultResponseFinalizer.finalize({
                    raw,
                    ultimaMsg,
                    userName,
                    hasAssistantBefore: decision.hasAssistantBefore,
                    userId,
                    supabase,
                    lastMessageId: lastMessageId ?? undefined,
                    mode: "full",
                    startedAt: inicioEco,
                    usageTokens: usageFromStream?.total_tokens ?? undefined,
                    modelo: modelFromStream ?? principalModel,
                    sessionMeta,
                    sessaoId: sessionMeta?.sessaoId ?? undefined,
                    origemSessao: sessionMeta?.origem ?? undefined,
                });
            }
            return finalizePromise;
        };
        const doneSnapshot = { ...timings };
        await emitStream({
            type: "control",
            name: "done",
            meta: {
                finishReason,
                usage: usageFromStream,
                modelo: modelFromStream ?? principalModel,
                length: raw.length,
            },
            timings: doneSnapshot,
        });
        return {
            raw,
            modelo: modelFromStream ?? principalModel,
            usage: usageFromStream,
            finalize,
            timings: doneSnapshot,
        };
    }
    let data;
    timings.llmStart = (0, utils_1.now)();
    inicioEco = timings.llmStart;
    logger_1.log.info("// LATENCY: llm_request_start", {
        at: timings.llmStart,
        sincePromptReadyMs: timings.contextBuildEnd && timings.llmStart
            ? timings.llmStart - timings.contextBuildEnd
            : undefined,
    });
    try {
        data = await (0, ClaudeAdapter_1.claudeChatCompletion)({
            // 'prompt' já é a lista de mensagens pronta (inclui system + histórico fatiado)
            messages: prompt,
            model: principalModel,
            temperature: 0.6,
            maxTokens,
        });
    }
    catch (e) {
        logger_1.log.warn(`[getEcoResponse] LLM rota completa falhou: ${e?.message}`);
        const msg = "Desculpa, tive um problema técnico agora. Topa tentar de novo?";
        return responseFinalizer_1.defaultResponseFinalizer.finalize({
            raw: msg,
            ultimaMsg,
            userName,
            hasAssistantBefore: decision.hasAssistantBefore,
            userId,
            supabase,
            lastMessageId: lastMessageId ?? undefined,
            mode: "full",
            startedAt: inicioEco,
            usageTokens: undefined,
            modelo: "full-fallback",
            skipBloco: true,
            sessionMeta,
            sessaoId: sessionMeta?.sessaoId ?? undefined,
            origemSessao: sessionMeta?.origem ?? undefined,
        });
    }
    timings.llmEnd = (0, utils_1.now)();
    logger_1.log.info("// LATENCY: llm_request_end", {
        at: timings.llmEnd,
        durationMs: timings.llmStart && timings.llmEnd ? timings.llmEnd - timings.llmStart : undefined,
    });
    if ((0, logger_1.isDebug)()) {
        logger_1.log.debug("[Orchestrator] resposta pronta", {
            duracaoEcoMs: (0, utils_1.now)() - inicioEco,
            lenMensagem: (data?.content || "").length,
        });
    }
    return responseFinalizer_1.defaultResponseFinalizer.finalize({
        raw: data?.content ?? "",
        ultimaMsg,
        userName,
        hasAssistantBefore: decision.hasAssistantBefore,
        userId,
        supabase,
        lastMessageId: lastMessageId ?? undefined,
        mode: "full",
        startedAt: inicioEco,
        usageTokens: data?.usage?.total_tokens ?? undefined,
        modelo: data?.model,
        sessionMeta,
        sessaoId: sessionMeta?.sessaoId ?? undefined,
        origemSessao: sessionMeta?.origem ?? undefined,
    });
}
//# sourceMappingURL=ConversationOrchestrator.js.map