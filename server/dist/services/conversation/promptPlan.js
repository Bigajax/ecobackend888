"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectExplicitAskForSteps = detectExplicitAskForSteps;
exports.buildFullPrompt = buildFullPrompt;
const utils_1 = require("../../utils");
const STYLE_COACH = "Preferir plano COACH (30%): acolher (1 linha) • encorajar com leveza • (opcional) até 3 passos curtos • fechar com incentivo.";
const STYLE_ESPELHO = "Preferir plano ESPELHO (70%): acolher (1 linha) • refletir padrões/sentimento (1 linha) • 1 pergunta aberta • fechar leve.";
function detectExplicitAskForSteps(text) {
    if (!text)
        return false;
    const rx = /\b(passos?|etapas?|como\s+fa(c|ç)o|como\s+fazer|checklist|guia|tutorial|roteiro|lista\s+de|me\s+mostra\s+como|o\s+que\s+fazer)\b/i;
    return rx.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}
function buildFullPrompt({ decision, ultimaMsg, systemPrompt, messages, historyLimit = 5, }) {
    const explicitAskForSteps = detectExplicitAskForSteps(ultimaMsg);
    const preferCoachFull = !decision.vivaAtivo &&
        (explicitAskForSteps || Number(decision.nivelRoteador) === 1);
    const STYLE_SELECTOR_FULL = preferCoachFull ? STYLE_COACH : STYLE_ESPELHO;
    const history = (messages ?? []).slice(-historyLimit).map((m) => ({
        role: (0, utils_1.mapRoleForOpenAI)(m.role),
        content: m.content,
    }));
    const prompt = [
        { role: "system", content: `${STYLE_SELECTOR_FULL}\n${systemPrompt}` },
        ...history,
    ];
    const ultimaLen = ultimaMsg ? ultimaMsg.length : 0;
    const maxTokens = ultimaLen < 140 ? 420 : ultimaLen < 280 ? 560 : 700;
    return { prompt, maxTokens };
}
//# sourceMappingURL=promptPlan.js.map