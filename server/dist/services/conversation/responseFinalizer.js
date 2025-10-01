"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultResponseFinalizer = exports.ResponseFinalizer = void 0;
const utils_1 = require("../../utils");
const EmotionalAnalyzer_1 = require("../../core/EmotionalAnalyzer");
const MemoryService_1 = require("../../services/MemoryService");
const mixpanelEvents_1 = require("../../analytics/events/mixpanelEvents");
const logger_1 = require("../promptContext/logger");
const helpers_1 = require("./helpers");
class ResponseFinalizer {
    deps;
    constructor(deps = {
        gerarBlocoTecnicoComCache: EmotionalAnalyzer_1.gerarBlocoTecnicoComCache,
        saveMemoryOrReference: MemoryService_1.saveMemoryOrReference,
        trackMensagemEnviada: mixpanelEvents_1.trackMensagemEnviada,
        trackEcoDemorou: mixpanelEvents_1.trackEcoDemorou,
        trackBlocoTecnico: mixpanelEvents_1.trackBlocoTecnico,
        trackSessaoEntrouChat: mixpanelEvents_1.trackSessaoEntrouChat,
        identifyUsuario: mixpanelEvents_1.identifyUsuario,
    }) {
        this.deps = deps;
    }
    getBlocoTimeoutMs() {
        const raw = process.env.ECO_BLOCO_TIMEOUT_MS;
        const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
    }
    gerarBlocoComTimeout({ ultimaMsg, blocoTarget, mode, skipBloco, distinctId, userId, }) {
        const startedAt = (0, utils_1.now)();
        const timeoutMs = this.getBlocoTimeoutMs();
        let timeoutId;
        const fullPromise = this.deps
            .gerarBlocoTecnicoComCache(ultimaMsg, blocoTarget)
            .then((value) => {
            if (timeoutId)
                clearTimeout(timeoutId);
            const duracao = (0, utils_1.now)() - startedAt;
            this.deps.trackBlocoTecnico({
                distinctId,
                userId,
                status: "success",
                mode,
                skipBloco,
                duracaoMs: duracao,
                intensidade: value && typeof value.intensidade === "number"
                    ? value.intensidade
                    : undefined,
            });
            return value;
        })
            .catch((error) => {
            if (timeoutId)
                clearTimeout(timeoutId);
            const duracao = (0, utils_1.now)() - startedAt;
            this.deps.trackBlocoTecnico({
                distinctId,
                userId,
                status: "failure",
                mode,
                skipBloco,
                duracaoMs: duracao,
                erro: error instanceof Error ? error.message : String(error),
            });
            return null;
        });
        if (timeoutMs === 0) {
            return { race: fullPromise, full: fullPromise };
        }
        const timeoutPromise = new Promise((resolve) => {
            timeoutId = setTimeout(() => {
                logger_1.log.warn(`⚠️ gerarBlocoTecnicoComCache demorou mais de ${timeoutMs}ms; respondendo sem bloco.`);
                const duracao = (0, utils_1.now)() - startedAt;
                this.deps.trackBlocoTecnico({
                    distinctId,
                    userId,
                    status: "timeout",
                    mode,
                    skipBloco,
                    duracaoMs: duracao,
                });
                resolve(null);
            }, timeoutMs);
        });
        const racePromise = Promise.race([fullPromise, timeoutPromise]);
        return { race: racePromise, full: fullPromise };
    }
    async persistirMemoriaEmBackground(params) {
        const { userId, supabase, lastMessageId, cleaned, ultimaMsg, skipBloco, mode, distinctId, } = params;
        if (!userId)
            return;
        let blocoParaSalvar = params.bloco;
        if (!blocoParaSalvar && params.blocoPromise) {
            try {
                blocoParaSalvar = await params.blocoPromise;
            }
            catch (e) {
                const mensagem = e instanceof Error ? e.message : String(e);
                logger_1.log.warn("⚠️ Pós-processo falhou ao aguardar bloco em background:", mensagem);
            }
        }
        if (!skipBloco) {
            const reprocessStartedAt = (0, utils_1.now)();
            try {
                if (!blocoParaSalvar) {
                    blocoParaSalvar = await this.deps.gerarBlocoTecnicoComCache(ultimaMsg, params.blocoTarget);
                    const duracao = (0, utils_1.now)() - reprocessStartedAt;
                    if (blocoParaSalvar) {
                        this.deps.trackBlocoTecnico({
                            distinctId,
                            userId,
                            status: "success",
                            mode,
                            skipBloco,
                            duracaoMs: duracao,
                            intensidade: typeof blocoParaSalvar?.intensidade === "number"
                                ? blocoParaSalvar.intensidade
                                : undefined,
                        });
                    }
                }
            }
            catch (e) {
                const mensagem = e instanceof Error ? e.message : String(e);
                logger_1.log.warn("⚠️ Pós-processo falhou ao gerar bloco completo:", mensagem);
                this.deps.trackBlocoTecnico({
                    distinctId,
                    userId,
                    status: "failure",
                    mode,
                    skipBloco,
                    duracaoMs: (0, utils_1.now)() - reprocessStartedAt,
                    erro: mensagem,
                });
            }
        }
        try {
            await this.deps.saveMemoryOrReference({
                supabase,
                userId,
                lastMessageId,
                cleaned,
                bloco: blocoParaSalvar,
                ultimaMsg,
            });
        }
        catch (e) {
            logger_1.log.warn("⚠️ Pós-processo falhou:", e.message);
        }
    }
    async finalize({ raw, ultimaMsg, userName, hasAssistantBefore, userId, supabase, lastMessageId, mode, startedAt, usageTokens, modelo, trackDelayThresholdMs = 2500, skipBloco = false, sessionMeta, distinctId: providedDistinctId, sessaoId: providedSessaoId, origemSessao, }) {
        const distinctId = providedDistinctId ?? sessionMeta?.distinctId ?? userId;
        if (!hasAssistantBefore) {
            const sessaoId = providedSessaoId ?? sessionMeta?.sessaoId ?? undefined;
            const origem = origemSessao ?? sessionMeta?.origem ?? undefined;
            this.deps.trackSessaoEntrouChat({
                distinctId,
                userId,
                mode,
                sessaoId,
                origem,
                versaoApp: sessionMeta?.versaoApp,
                device: sessionMeta?.device,
                ambiente: sessionMeta?.ambiente,
            });
        }
        const base = (0, utils_1.formatarTextoEco)((0, utils_1.limparResposta)(raw || "Desculpa, não consegui responder agora. Pode tentar de novo?"));
        const nome = (0, helpers_1.firstName)(userName);
        const identityCleaned = (0, helpers_1.stripIdentityCorrection)(base, nome);
        const cleaned = (0, helpers_1.stripRedundantGreeting)(identityCleaned, hasAssistantBefore);
        const blocoTarget = mode === "fast" ? identityCleaned : cleaned;
        let bloco = null;
        let blocoPromise;
        if (!skipBloco) {
            const blocoTimeout = this.gerarBlocoComTimeout({
                ultimaMsg,
                blocoTarget,
                mode,
                skipBloco,
                distinctId: providedDistinctId ?? sessionMeta?.distinctId ?? userId,
                userId,
            });
            blocoPromise = blocoTimeout.full;
            if (mode === "fast") {
                this.deps.trackBlocoTecnico({
                    distinctId: providedDistinctId ?? sessionMeta?.distinctId ?? userId,
                    userId,
                    status: "pending",
                    mode,
                    skipBloco,
                });
            }
            else {
                bloco = await blocoTimeout.race;
            }
        }
        const response = { message: cleaned };
        if (bloco && typeof bloco.intensidade === "number") {
            response.intensidade = bloco.intensidade;
            response.resumo = bloco?.analise_resumo?.trim().length
                ? bloco.analise_resumo.trim()
                : cleaned;
            response.emocao = bloco.emocao_principal || "indefinida";
            response.tags = Array.isArray(bloco.tags) ? bloco.tags : [];
            response.categoria = bloco.categoria ?? null;
        }
        else if (bloco) {
            response.categoria = bloco.categoria ?? null;
        }
        const duracao = (0, utils_1.now)() - startedAt;
        if (sessionMeta) {
            this.deps.identifyUsuario({
                distinctId,
                userId,
                versaoApp: sessionMeta.versaoApp ?? null,
                device: sessionMeta.device ?? null,
                ambiente: sessionMeta.ambiente ?? null,
            });
        }
        if (mode === "full" && duracao > trackDelayThresholdMs) {
            this.deps.trackEcoDemorou({
                userId,
                distinctId,
                duracaoMs: duracao,
                ultimaMsg,
            });
        }
        const blocoStatus = skipBloco
            ? "skipped"
            : mode === "fast"
                ? "pending"
                : bloco
                    ? "ready"
                    : "missing";
        this.deps.trackMensagemEnviada({
            userId,
            distinctId,
            tempoRespostaMs: duracao,
            tokensUsados: usageTokens,
            modelo,
            blocoStatus,
        });
        void this.persistirMemoriaEmBackground({
            userId,
            supabase,
            lastMessageId,
            cleaned,
            bloco,
            blocoPromise,
            blocoTarget,
            ultimaMsg,
            skipBloco,
            mode,
            distinctId,
        });
        return response;
    }
}
exports.ResponseFinalizer = ResponseFinalizer;
exports.defaultResponseFinalizer = new ResponseFinalizer();
//# sourceMappingURL=responseFinalizer.js.map