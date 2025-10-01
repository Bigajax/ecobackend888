"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENT_MESSAGE_PLACEHOLDER = void 0;
exports.composePromptBase = composePromptBase;
exports.applyCurrentMessage = applyCurrentMessage;
exports.composePrompt = composePrompt;
exports.CURRENT_MESSAGE_PLACEHOLDER = "__ECO_MENSAGEM_ATUAL__";
function composePromptBase({ nivel, memCount, forcarMetodoViva, extras, stitched, memRecallBlock = "", instructionText, }) {
    const header = [
        `Nível de abertura: ${nivel}`,
        memCount > 0 ? `Memórias (internas): ${memCount} itens` : `Memórias: none`,
        forcarMetodoViva ? "Forçar VIVA: sim" : "Forçar VIVA: não",
    ].join(" | ");
    const extrasBlock = extras.length
        ? `\n\n${extras.map((entry) => `• ${entry}`).join("\n")}`
        : "";
    return [
        `// CONTEXTO ECO — NV${nivel}`,
        `// ${header}${extrasBlock}`,
        "",
        stitched,
        "",
        memRecallBlock || "",
        "",
        instructionText,
        "",
        `Mensagem atual: ${exports.CURRENT_MESSAGE_PLACEHOLDER}`,
    ]
        .filter(Boolean)
        .join("\n")
        .trim();
}
function applyCurrentMessage(base, texto) {
    return base.replace(exports.CURRENT_MESSAGE_PLACEHOLDER, texto);
}
function composePrompt(input) {
    const base = composePromptBase(input);
    return applyCurrentMessage(base, input.texto);
}
//# sourceMappingURL=promptComposer.js.map