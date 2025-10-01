"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertMemory = insertMemory;
exports.listMemories = listMemories;
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
async function insertMemory(table, payload) {
    const { data, error } = await supabaseAdmin_1.supabase.from(table).insert([payload]).select();
    if (error) {
        throw new Error(error.message || "Erro ao salvar no Supabase.");
    }
    return (data ?? []);
}
async function listMemories(userId, options) {
    const { tags = [], limit } = options;
    let query = supabaseAdmin_1.supabase
        .from("memories")
        .select("*")
        .eq("usuario_id", userId)
        .eq("salvar_memoria", true)
        .order("created_at", { ascending: false });
    if (tags.length) {
        query = query.overlaps("tags", tags);
    }
    if (limit && limit > 0) {
        query = query.range(0, limit - 1);
    }
    const { data, error } = await query;
    if (error) {
        throw new Error(error.message || "Erro ao buscar memórias no Supabase.");
    }
    return (data ?? []);
}
//# sourceMappingURL=supabaseMemoryRepository.js.map