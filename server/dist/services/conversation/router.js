"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConversationRouter = exports.ConversationRouter = void 0;
const utils_1 = require("../../utils");
const Selector_1 = require("../promptContext/Selector");
const helpers_1 = require("./helpers");
class ConversationRouter {
    decide({ messages, ultimaMsg, forcarMetodoViva, promptOverride, }) {
        const saudacaoBreve = (0, Selector_1.detectarSaudacaoBreve)(ultimaMsg);
        const nivelRoteador = (0, Selector_1.derivarNivel)(ultimaMsg, saudacaoBreve);
        const lowComplexity = (0, helpers_1.isLowComplexity)(ultimaMsg);
        const vivaAtivo = Boolean(forcarMetodoViva || (0, helpers_1.heuristicaPreViva)(ultimaMsg));
        const forceFull = Boolean(promptOverride && promptOverride.trim().length > 0);
        const hasAssistantBefore = messages.filter((m) => (0, utils_1.mapRoleForOpenAI)(m.role) === "assistant").length > 0;
        const canFastLane = !forceFull &&
            lowComplexity &&
            !vivaAtivo &&
            (typeof nivelRoteador === "number" ? nivelRoteador <= 1 : true);
        return {
            mode: canFastLane ? "fast" : "full",
            hasAssistantBefore,
            vivaAtivo,
            lowComplexity,
            nivelRoteador: typeof nivelRoteador === "number" ? nivelRoteador : null,
            forceFull,
        };
    }
}
exports.ConversationRouter = ConversationRouter;
exports.defaultConversationRouter = new ConversationRouter();
//# sourceMappingURL=router.js.map