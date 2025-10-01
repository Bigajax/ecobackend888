"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectExplicitAskForSteps = detectExplicitAskForSteps;
exports.runFastLaneLLM = runFastLaneLLM;
const utils_1 = require("../../utils");
const logger_1 = require("../promptContext/logger");
const ASK_FOR_STEPS_REGEX = /\b(passos?|etapas?|como\s+fa(c|ç)o|como\s+fazer|checklist|guia|tutorial|roteiro|lista\s+de|me\s+mostra\s+como|o\s+que\s+fazer)\b/i;
const ID_ECO_MINI = "Você é a Eco: espelho socrático de autoconhecimento — reflexiva, curiosa e acolhedora. " +
    "Proporção: 70% espelho (devolver padrões, clarear percepções) + 30% coach gentil (encorajamento, humor leve). " +
    "Tom: reflexivo, claro, acolhedor, levemente bem-humorado. Use português brasileiro natural. " +
    "Cultive: escuta paciente, curiosidade filosófica, espelhamento sensível, incentivo leve. " +
    "Evite: linguagem robótica, jargões de coaching, prescrições, diagnósticos e substituir terapia. " +
    "Objetivo: criar um espaço seguro de reflexão para o usuário se ver com mais clareza, com companhia curiosa e respeitosa.";
const STYLE_HINTS_MINI = "Responda curto (1–2 frases) quando possível, claro e acolhedor. Se pedirem passos, no máximo 3 itens.";
function detectExplicitAskForSteps(text) {
    if (!text)
        return false;
    const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return ASK_FOR_STEPS_REGEX.test(normalized);
}
function buildStyleSelector(preferCoach) {
    return preferCoach
        ? "Preferir plano COACH (30%): acolher (1 linha) • encorajar com leveza • (opcional) até 3 passos curtos • fechar com incentivo."
        : "Preferir plano ESPELHO (70%): acolher (1 linha) • refletir padrões/sentimento (1 linha) • 1 pergunta aberta • fechar leve.";
}
function montarSystemMessage({ preferCoach, nome, }) {
    const style = buildStyleSelector(preferCoach);
    const nameHint = nome
        ? `O usuário se chama ${nome}. Use o nome apenas quando fizer sentido. Nunca corrija nomes nem diga frases como 'sou a Eco, não o ${nome}'. `
        : "Nunca corrija nomes. ";
    return `${style} ${ID_ECO_MINI} ${STYLE_HINTS_MINI} ${nameHint}`;
}
function montarSlimHistory(messages) {
    const history = Array.isArray(messages) ? messages : [];
    const turns = history.slice(-3).map((m) => ({
        role: (0, utils_1.mapRoleForOpenAI)(m.role),
        content: m.content,
    }));
    return turns;
}
async function runFastLaneLLM({ messages, userName, ultimaMsg, hasAssistantBefore, userId, supabase, lastMessageId, startedAt, deps, sessionMeta, }) {
    const nome = deps.firstName?.(userName);
    const preferCoach = detectExplicitAskForSteps(ultimaMsg);
    const system = montarSystemMessage({ preferCoach, nome });
    const slimHistory = montarSlimHistory(messages);
    const payload = {
        messages: [{ role: "system", content: system }, ...slimHistory],
        model: process.env.ECO_FAST_MODEL || "anthropic/claude-3-5-haiku",
        temperature: 0.5,
        maxTokens: 220,
    };
    let completion;
    try {
        completion = await deps.claudeClient(payload);
    }
    catch (error) {
        logger_1.log.warn(`[fastLaneLLM] falhou: ${error?.message}`);
        const fallback = "Tô aqui com você. Quer me contar um pouco mais?";
        const response = await deps.responseFinalizer.finalize({
            raw: fallback,
            ultimaMsg,
            userName,
            hasAssistantBefore,
            userId,
            supabase,
            lastMessageId,
            mode: "fast",
            startedAt,
            usageTokens: undefined,
            modelo: "fastlane-fallback",
            sessionMeta,
            sessaoId: sessionMeta?.sessaoId ?? undefined,
            origemSessao: sessionMeta?.origem ?? undefined,
        });
        return { raw: fallback, usage: null, model: "fastlane-fallback", response };
    }
    const raw = completion?.content ?? "";
    const usage = completion?.usage ?? null;
    const model = completion?.model;
    const response = await deps.responseFinalizer.finalize({
        raw,
        ultimaMsg,
        userName,
        hasAssistantBefore,
        userId,
        supabase,
        lastMessageId,
        mode: "fast",
        startedAt,
        usageTokens: usage?.total_tokens ?? undefined,
        modelo: model,
        sessionMeta,
        sessaoId: sessionMeta?.sessaoId ?? undefined,
        origemSessao: sessionMeta?.origem ?? undefined,
    });
    return { raw, usage, model, response };
}
//# sourceMappingURL=fastLane.js.map