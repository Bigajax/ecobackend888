"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPromptEcoPreview = void 0;
exports.montarContextoEco = montarContextoEco;
// Pode importar pelo barrel (index)…
const promptContext_1 = require("../services/promptContext");
// …ou direto do módulo:
// import montarContextoEco, { ContextBuilder } from "../services/promptContext/ContextBuilder";
/**
 * Monta o contexto ECO a partir do input do orquestrador.
 * Retorna apenas a string do prompt (o builder atual não retorna meta).
 */
async function montarContextoEco(input) {
    const safe = {
        texto: input?.texto ?? input?.ultimaMsg ?? "",
        userId: input?.userId ?? null,
        userName: input?.userName ?? null,
        perfil: input?.perfil ?? null,
        mems: Array.isArray(input?.mems) ? input.mems : [],
        heuristicas: Array.isArray(input?.heuristicas) ? input.heuristicas : [],
        userEmbedding: Array.isArray(input?.userEmbedding) ? input.userEmbedding : [],
        forcarMetodoViva: !!input?.forcarMetodoViva,
        blocoTecnicoForcado: input?.blocoTecnicoForcado ?? null,
        derivados: input?.derivados ?? null,
        aberturaHibrida: input?.aberturaHibrida ?? null,
        // no comportamento anterior você queria "pular saudação" por padrão?
        // Aqui mantemos a semântica original: se não vier nada, vira false (não pular).
        skipSaudacao: !!input?.skipSaudacao,
    };
    const contexto = await promptContext_1.ContextBuilder.build(safe);
    return contexto.montarMensagemAtual(safe.texto);
}
/**
 * Endpoint opcional de preview.
 * Devolve apenas { prompt } porque o builder não calcula meta.
 */
const getPromptEcoPreview = async (_req, res) => {
    try {
        const contexto = await promptContext_1.ContextBuilder.build({ texto: "" });
        res.json({ prompt: contexto.montarMensagemAtual("") });
    }
    catch (err) {
        console.warn("❌ Erro ao montar o prompt:", err);
        res.status(500).json({ error: "Erro ao montar o prompt" });
    }
};
exports.getPromptEcoPreview = getPromptEcoPreview;
//# sourceMappingURL=promptController.js.map