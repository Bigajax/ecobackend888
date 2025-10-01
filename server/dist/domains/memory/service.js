"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryService = void 0;
const embeddingService_1 = require("../../adapters/embeddingService");
const buscarMemorias_1 = require("../../services/buscarMemorias");
const tagService_1 = require("../../services/tagService");
const heuristicaNivelAbertura_1 = require("../../utils/heuristicaNivelAbertura");
function normalizeTags(tags) {
    if (!tags)
        return [];
    if (Array.isArray(tags))
        return tags;
    return tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
}
function gerarResumoEco(texto, tags, intensidade, emocaoPrincipal, analiseResumo) {
    const linhas = [`🗣️ "${(texto || "").trim()}"`];
    if (tags.length)
        linhas.push(`🏷️ Tags: ${tags.join(", ")}`);
    if (emocaoPrincipal)
        linhas.push(`❤️ Emoção: ${emocaoPrincipal}`);
    linhas.push(`🔥 Intensidade: ${intensidade}`);
    if (analiseResumo && analiseResumo.trim()) {
        linhas.push(`\n🧭 Resumo Analítico:\n${analiseResumo.trim()}`);
    }
    else {
        linhas.push(`⚠️ Sem análise detalhada disponível.`);
    }
    return linhas.join("\n");
}
class MemoryService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async registerMemory(userId, input) {
        const intensidadeClamped = Math.max(0, Math.min(10, Number(input.intensidade) ?? 0));
        const salvar = typeof input.salvar_memoria === "boolean" ? input.salvar_memoria : true;
        const destinoTabela = intensidadeClamped >= 7 && salvar ? "memories" : "referencias_temporarias";
        const normalizedTags = normalizeTags(input.tags);
        const shouldAutoTag = normalizedTags.length === 0;
        const resumoAnalitico = input.analise_resumo?.trim();
        const textoBase = input.texto;
        const reuseMainEmbedding = !resumoAnalitico || resumoAnalitico === textoBase;
        const tagsPromise = shouldAutoTag
            ? (0, tagService_1.gerarTagsAutomaticasViaIA)(textoBase)
            : Promise.resolve(normalizedTags);
        const [finalTags, embeddingPrincipal, embeddingEmocionalRaw] = await Promise.all([
            tagsPromise,
            (0, embeddingService_1.embedTextoCompleto)(textoBase),
            reuseMainEmbedding
                ? Promise.resolve(null)
                : (0, embeddingService_1.embedTextoCompleto)(resumoAnalitico),
        ]);
        const embedding = (0, embeddingService_1.unitNorm)(embeddingPrincipal);
        const embeddingEmocional = (0, embeddingService_1.unitNorm)(embeddingEmocionalRaw ?? embeddingPrincipal);
        const nivelAbertura = typeof input.nivel_abertura === "number"
            ? input.nivel_abertura
            : (0, heuristicaNivelAbertura_1.heuristicaNivelAbertura)(input.texto);
        const payload = {
            usuario_id: userId,
            mensagem_id: input.mensagem_id ?? null,
            resumo_eco: gerarResumoEco(input.texto, finalTags, intensidadeClamped, input.emocao_principal, input.analise_resumo),
            tags: finalTags,
            intensidade: intensidadeClamped,
            emocao_principal: input.emocao_principal ?? null,
            contexto: input.contexto ?? null,
            dominio_vida: input.dominio_vida ?? null,
            padrao_comportamental: input.padrao_comportamental ?? null,
            salvar_memoria: Boolean(salvar),
            nivel_abertura: nivelAbertura,
            analise_resumo: input.analise_resumo ?? null,
            categoria: input.categoria ?? "emocional",
            embedding,
            embedding_emocional: embeddingEmocional,
        };
        const data = await this.repository.save(destinoTabela, payload);
        return { table: destinoTabela, data };
    }
    async listMemories(userId, input) {
        const records = await this.repository.list(userId, {
            tags: input.tags ?? [],
            limit: input.limit,
        });
        return records.filter((memory) => typeof memory.resumo_eco === "string" && Boolean(memory.resumo_eco.trim()));
    }
    async findSimilarMemories(userId, input) {
        return (0, buscarMemorias_1.buscarMemoriasSemelhantes)(userId, {
            texto: input.texto,
            k: input.limite,
            threshold: input.threshold,
        });
    }
}
exports.MemoryService = MemoryService;
//# sourceMappingURL=service.js.map