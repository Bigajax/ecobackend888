"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buscarEncadeamentosPassados = buscarEncadeamentosPassados;
// services/buscarEncadeamentos.ts
const supabase_js_1 = require("@supabase/supabase-js");
const embeddingService_1 = require("./embeddingService");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
async function buscarEncadeamentosPassados(userId, entradaOrOpts) {
    try {
        if (!userId)
            return [];
        // ---------------------------
        // Normalização de parâmetros
        // ---------------------------
        let texto = "";
        let userEmbedding;
        let kBase = 1;
        let threshold = 0.8;
        let daysBack = 90;
        if (typeof entradaOrOpts === "string") {
            texto = entradaOrOpts ?? "";
        }
        else {
            texto = entradaOrOpts.texto ?? "";
            userEmbedding = entradaOrOpts.userEmbedding;
            if (typeof entradaOrOpts.kBase === "number")
                kBase = entradaOrOpts.kBase;
            if (typeof entradaOrOpts.threshold === "number")
                threshold = Math.max(0, Math.min(1, entradaOrOpts.threshold));
            if (typeof entradaOrOpts.daysBack === "number" || entradaOrOpts.daysBack === null)
                daysBack = entradaOrOpts.daysBack;
        }
        // Evita custo se não tiver embedding e o texto for muito curto
        if (!userEmbedding && (!texto || texto.trim().length < 6)) {
            console.warn("⚠️ Entrada muito curta e sem embedding — pulando encadeamento.");
            return [];
        }
        // ---------------------------
        // Gera OU reaproveita o embedding (e normaliza)
        // ---------------------------
        const consulta_embedding = userEmbedding?.length
            ? (0, embeddingService_1.unitNorm)(userEmbedding)
            : (0, embeddingService_1.unitNorm)(await (0, embeddingService_1.embedTextoCompleto)(texto, "🔗 encadeamento"));
        // ---------------------------
        // 1) Busca memória base mais similar do usuário (RPC v2)
        // ---------------------------
        const match_count = Math.max(1, kBase);
        const match_threshold = threshold;
        const call = async (db) => {
            const { data, error } = await supabase.rpc("buscar_memorias_semelhantes_v2", {
                query_embedding: consulta_embedding,
                user_id_input: userId,
                match_count,
                match_threshold,
                days_back: db, // inteiro (dias) ou null
            });
            if (error) {
                console.error("❌ Erro RPC buscar_memorias_semelhantes_v2:", {
                    message: error.message,
                    details: error?.details ?? null,
                    hint: error?.hint ?? null,
                });
                return [];
            }
            return (data ?? []);
        };
        // Fallback temporal: daysBack → 180 → sem filtro
        let baseRows = [];
        const tryOrder = daysBack === null ? [null] : [daysBack ?? 90, 180, null];
        for (const db of tryOrder) {
            baseRows = await call(db);
            if (baseRows.length)
                break;
        }
        if (!baseRows.length) {
            console.warn("⚠️ Nenhuma memória similar encontrada para o encadeamento.");
            return [];
        }
        // pega a primeira memória-base (mais similar)
        const memoriaBaseId = baseRows[0]?.id;
        if (!memoriaBaseId) {
            console.warn("⚠️ Memória similar sem id — abortando encadeamento.");
            return [];
        }
        // ---------------------------
        // 2) Busca encadeamento recursivo a partir da memória encontrada
        // ---------------------------
        const { data: encadeamentos, error: erroEncadeamento } = await supabase.rpc("buscar_encadeamentos_memorias", { raiz_id: memoriaBaseId });
        if (erroEncadeamento) {
            console.error("❌ Erro ao buscar encadeamentos (RPC buscar_encadeamentos_memorias):", {
                message: erroEncadeamento.message,
                details: erroEncadeamento.details ?? null,
                hint: erroEncadeamento.hint ?? null,
            });
            return [];
        }
        return encadeamentos ?? [];
    }
    catch (e) {
        console.error("❌ Erro inesperado ao buscar encadeamentos:", e.message);
        return [];
    }
}
//# sourceMappingURL=buscarEncadeamentos.js.map