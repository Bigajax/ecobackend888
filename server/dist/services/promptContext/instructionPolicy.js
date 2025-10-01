"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInstructionBlocks = buildInstructionBlocks;
exports.renderInstructionBlocks = renderInstructionBlocks;
const RESPONSE_PLAN_ESPELHO = "Fluxo (espelho 70%): acolher (1 linha) • refletir padrões ou sentimentos (1 linha) • (opcional) nomear uma impressão curta • 1 pergunta aberta socrática • fechar leve e claro.";
const RESPONSE_PLAN_COACH = "Fluxo (coach 30%): acolher (1 linha) • encorajar com humor ou leveza (1 linha) • (opcional) até 3 passos práticos curtos • fechar com incentivo.";
const FINAL_INSTRUCTIONS = "Ética: sem diagnósticos nem promessas de cura. Priorize autonomia, cuidado e ritmo. Se tema clínico/urgente, acolha e oriente apoio adequado.";
function buildInstructionBlocks(nivel) {
    if (nivel === 1) {
        return [{ title: "ECO_INSTRUCOES_FINAIS", body: FINAL_INSTRUCTIONS }];
    }
    return [
        { title: "ECO_RESPONSE_PLAN_ESPELHO", body: RESPONSE_PLAN_ESPELHO },
        { title: "ECO_RESPONSE_PLAN_COACH", body: RESPONSE_PLAN_COACH },
        { title: "ECO_INSTRUCOES_FINAIS", body: FINAL_INSTRUCTIONS },
    ];
}
function renderInstructionBlocks(blocks) {
    return blocks
        .map((block) => `### ${block.title}\n${block.body}`.trim())
        .join("\n\n");
}
//# sourceMappingURL=instructionPolicy.js.map