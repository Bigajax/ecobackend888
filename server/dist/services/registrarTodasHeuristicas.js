"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrarTodasHeuristicas = registrarTodasHeuristicas;
// services/registrarTodasHeuristicas.ts
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const embeddingService_1 = require("../adapters/embeddingService");
const supabaseAdmin_1 = require("../lib/supabaseAdmin"); // ✅ instância singleton
const CacheService_1 = require("./CacheService");
// Pasta onde estão os .txt/.md das heurísticas
const heuristicasDir = path_1.default.join(__dirname, "../assets/modulos_cognitivos");
// Normaliza possível retorno do embedding (array ou JSON string)
function toNumberArray(v) {
    if (Array.isArray(v))
        return v.map((x) => Number(x)).filter(Number.isFinite);
    try {
        const parsed = JSON.parse(String(v));
        if (Array.isArray(parsed))
            return parsed.map((x) => Number(x)).filter(Number.isFinite);
    }
    catch {
        /* ignore */
    }
    return [];
}
function isHeuristicaFile(name) {
    return /\.(txt|md)$/i.test(name);
}
async function registrarTodasHeuristicas() {
    let invalidated = false;
    try {
        const arquivos = await promises_1.default.readdir(heuristicasDir);
        for (const arquivo of arquivos) {
            const caminho = path_1.default.join(heuristicasDir, arquivo);
            // ignora diretórios e arquivos não .txt/.md
            const stat = await promises_1.default.stat(caminho);
            if (!stat.isFile() || !isHeuristicaFile(arquivo))
                continue;
            const conteudo = await promises_1.default.readFile(caminho, "utf-8");
            // 1) Verifica duplicidade pelo nome do arquivo
            const { data: existente, error: buscaErro } = await supabaseAdmin_1.supabase
                .from("heuristicas_embeddings")
                .select("id")
                .eq("arquivo", arquivo)
                .maybeSingle();
            if (buscaErro) {
                console.warn(`⚠️ Erro ao verificar duplicidade de ${arquivo}:`, buscaErro.message);
                // segue adiante mesmo assim
            }
            if (existente?.id) {
                console.log(`📌 ${arquivo} já está registrado — pulando.`);
                continue;
            }
            // 2) Gera embedding (pode retornar array ou string JSON)
            const raw = await (0, embeddingService_1.embedTextoCompleto)(conteudo, "🔍 heuristica");
            const embedding = toNumberArray(raw);
            if (!embedding.length) {
                console.warn(`⚠️ Embedding vazio/inválido para ${arquivo} — pulando inserção.`);
                continue;
            }
            // 3) Insere (sem o campo embedding na seleção pra não trafegar vetor grande)
            const { error: insercaoErro } = await supabaseAdmin_1.supabase
                .from("heuristicas_embeddings")
                .insert([
                {
                    arquivo,
                    embedding,
                    tags: [], // ajuste se quiser inferir tags
                    tipo: "cognitiva",
                    origem: "modulos_cognitivos",
                },
            ]);
            if (insercaoErro) {
                console.error(`❌ Falha ao inserir ${arquivo}:`, insercaoErro.message);
            }
            else {
                console.log(`✅ Heurística registrada: ${arquivo}`);
                invalidated = true;
            }
        }
    }
    catch (err) {
        console.error("❌ Erro ao registrar heurísticas:", err?.message || err);
    }
    if (invalidated) {
        (0, CacheService_1.clearResponseCache)();
        console.log("🧹 RESPONSE_CACHE limpo após atualização de heurísticas.");
    }
}
// export default para compatibilidade com import default
exports.default = registrarTodasHeuristicas;
//# sourceMappingURL=registrarTodasHeuristicas.js.map