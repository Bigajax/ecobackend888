"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultGreetingPipeline = exports.GreetingPipeline = void 0;
const utils_1 = require("../../utils");
const GreetGuard_1 = require("../../core/policies/GreetGuard");
const respostaSaudacaoAutomatica_1 = require("../../utils/respostaSaudacaoAutomatica");
class GreetingPipeline {
    guard;
    constructor(guard = GreetGuard_1.GreetGuard) {
        this.guard = guard;
    }
    handle({ messages, ultimaMsg, userId, userName, clientHour, greetingEnabled, }) {
        if (!greetingEnabled) {
            return { handled: false };
        }
        const assistantCount = messages.filter((m) => (0, utils_1.mapRoleForOpenAI)(m.role) === "assistant").length;
        const threadVazia = assistantCount === 0;
        const ultima = (ultimaMsg || "").trim();
        const dentroDoLimite = ultima.length <= respostaSaudacaoAutomatica_1.MAX_LEN_FOR_GREETING;
        const conteudoSubstantivo = /[?]|(\b(quero|preciso|como|por que|porque|ajuda|planejar|plano|passo|sinto|penso|lembro)\b)/i.test(ultima) || ultima.split(/\s+/).length > 6;
        // Normaliza clientHour para number | undefined
        const normalizedHour = clientHour == null ? undefined : Number(clientHour);
        // Mantém apenas mensagens com role válido para SaudacaoMsg
        const saudaMsgs = [];
        for (const m of messages.slice(-4)) {
            const r = this.toSaudRole(m.role);
            if (r) {
                saudaMsgs.push({
                    role: r,
                    content: m.content || "",
                });
            }
        }
        const auto = (0, respostaSaudacaoAutomatica_1.respostaSaudacaoAutomatica)({
            messages: saudaMsgs,
            userName,
            clientHour: normalizedHour,
        });
        // 👇 Early return: se não há auto, não tem o que saudar/despedir
        if (!auto)
            return { handled: false };
        if (auto.meta?.isFarewell) {
            return { handled: true, response: auto.text };
        }
        const isGreetingMeta = Boolean(auto.meta?.isGreeting || auto.meta?.contextualCue === "greeting");
        if (isGreetingMeta &&
            threadVazia &&
            dentroDoLimite &&
            !conteudoSubstantivo &&
            this.guard.can(userId)) {
            this.guard.mark(userId);
            return { handled: true, response: auto.text };
        }
        return { handled: false };
    }
    toSaudRole(role) {
        const mapped = (0, utils_1.mapRoleForOpenAI)(role);
        if (mapped === "user" || mapped === "assistant" || mapped === "system") {
            return mapped;
        }
        return undefined;
    }
}
exports.GreetingPipeline = GreetingPipeline;
exports.defaultGreetingPipeline = new GreetingPipeline();
//# sourceMappingURL=greeting.js.map