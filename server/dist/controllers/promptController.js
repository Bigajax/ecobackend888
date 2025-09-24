"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPromptEcoPreview = void 0;
exports.montarContextoEco = montarContextoEco;
const ContextBuilder_1 = require("../services/promptContext/ContextBuilder");
const builder = new ContextBuilder_1.ContextBuilder();
async function montarContextoEco(input) {
    // compat: aceita o mesmo objeto que você já passa do orchestrator
    const safe = {
        texto: input?.texto ?? input?.ultimaMsg ?? "",
        userId: input?.userId,
        userName: input?.userName,
        perfil: input?.perfil ?? null,
        mems: input?.mems ?? [],
        heuristicas: input?.heuristicas ?? [],
        userEmbedding: input?.userEmbedding ?? [],
        forcarMetodoViva: !!input?.forcarMetodoViva,
        blocoTecnicoForcado: input?.blocoTecnicoForcado ?? null,
        derivados: input?.derivados,
        aberturaHibrida: input?.aberturaHibrida ?? null,
        skipSaudacao: input?.skipSaudacao !== false,
    };
    const out = await builder.build(safe);
    return out.prompt;
}
// opcional: preview com meta
const getPromptEcoPreview = async (_req, res) => {
    try {
        const out = await builder.build({ texto: "" });
        res.json({ prompt: out.prompt, meta: out.meta });
    }
    catch (err) {
        console.warn("❌ Erro ao montar o prompt:", err);
        res.status(500).json({ error: "Erro ao montar o prompt" });
    }
};
exports.getPromptEcoPreview = getPromptEcoPreview;
//# sourceMappingURL=promptController.js.map