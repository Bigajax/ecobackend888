"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrarModulosFilosoficos = registrarModulosFilosoficos;
// server/src/services/registrarModulosFilosoficos.ts
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const supabase_js_1 = require("@supabase/supabase-js");
const embeddingService_1 = require("../adapters/embeddingService");
const CacheService_1 = require("./CacheService");
// Caminho correto da pasta
const pastaModulos = path_1.default.join(process.cwd(), "assets/modulos_filosoficos");
// Normaliza retorno do embedding (pode vir array ou JSON string)
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
// Inicializa Supabase só quando precisar
function getSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error("❌ Variáveis SUPABASE_URL ou SUPABASE_ANON_KEY ausentes.");
    }
    return (0, supabase_js_1.createClient)(url, key);
}
async function registrarModulosFilosoficos() {
    const supabase = getSupabase();
    let inseridos = 0;
    let pulados = 0;
    let invalidated = false;
    try {
        const arquivos = await promises_1.default.readdir(pastaModulos);
        for (const arquivo of arquivos) {
            try {
                const conteudo = await promises_1.default.readFile(path_1.default.join(pastaModulos, arquivo), "utf-8");
                // Verifica duplicidade
                const { data: jaExiste, error: dupErr } = await supabase
                    .from("heuristicas_embeddings")
                    .select("id")
                    .eq("arquivo", arquivo)
                    .eq("tipo", "filosofico")
                    .maybeSingle();
                if (dupErr) {
                    console.warn(`⚠️ Erro ao verificar duplicidade de ${arquivo}:`, dupErr.message);
                }
                if (jaExiste) {
                    console.log(`🟡 Já registrado: ${arquivo}`);
                    pulados++;
                    continue;
                }
                // Gera embedding
                const raw = await (0, embeddingService_1.embedTextoCompleto)(conteudo, `💠 ${arquivo}`);
                const embedding = toNumberArray(raw);
                if (!embedding.length) {
                    console.warn(`⚠️ Embedding vazio/inválido para ${arquivo} — pulando inserção.`);
                    continue;
                }
                // Insere
                const { error } = await supabase.from("heuristicas_embeddings").insert([
                    {
                        arquivo,
                        embedding,
                        tags: ["filosofia"],
                        tipo: "filosofico",
                        origem: "modulos_filosoficos",
                    },
                ]);
                if (error) {
                    console.error(`❌ Erro ao inserir ${arquivo}:`, error.message);
                }
                else {
                    console.log(`✅ Inserido: ${arquivo}`);
                    inseridos++;
                    invalidated = true;
                }
            }
            catch (err) {
                console.error(`⚠️ Erro no arquivo ${arquivo}:`, err.message);
            }
        }
        console.log(`🎓 Registro concluído. Inseridos: ${inseridos}, já existentes: ${pulados}`);
    }
    catch (err) {
        console.error("❌ Erro ao registrar módulos filosóficos:", err.message);
    }
    if (invalidated) {
        (0, CacheService_1.clearResponseCache)();
        console.log("🧹 RESPONSE_CACHE limpo após atualização de heurísticas filosóficas.");
    }
}
// ✅ Exporta como default para importar no server.ts
exports.default = registrarModulosFilosoficos;
// ✅ Executa apenas se chamado diretamente via CLI
if (require.main === module) {
    registrarModulosFilosoficos();
}
//# sourceMappingURL=registrarModulosFilosoficos.js.map