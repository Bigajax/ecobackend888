"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPromptEcoPreview = void 0;
const promptContext_1 = require("../services/promptContext");
const getPromptEcoPreview = async (_req, res) => {
    try {
        const out = await (0, promptContext_1.buildContextWithMeta)({ texto: "" });
        res.json({
            prompt: out.prompt,
            meta: out.meta ?? {}, // garante objeto vazio se meta não existir
        });
    }
    catch (err) {
        console.warn("✖ Erro ao montar o prompt:", err);
        res.status(500).json({ error: "Erro ao montar o prompt" });
    }
};
exports.getPromptEcoPreview = getPromptEcoPreview;
//# sourceMappingURL=promptPreview.js.map