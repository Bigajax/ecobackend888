import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import type { MemoryInsertPayload, MemoryRepository, MemoryRow } from "../domains/memory/repository";

export class SupabaseMemoryRepository implements MemoryRepository {
  async save(table: string, payload: MemoryInsertPayload): Promise<MemoryRow> {
    const admin = ensureSupabaseConfigured();
    const { data, error } = await admin.from(table).insert(payload).select("*").single();
    if (error) {
      throw new Error(error.message || "Erro ao salvar no Supabase.");
    }
    return data as MemoryRow;
  }

  async list(params: { usuario_id: string; tags?: string[]; limit?: number }): Promise<MemoryRow[]> {
    const admin = ensureSupabaseConfigured();
    let query = admin
      .from("memories")
      .select("*")
      .eq("usuario_id", params.usuario_id)
      .eq("salvar_memoria", true)
      .order("created_at", { ascending: false });

    if (params.tags?.length) {
      query = query.overlaps("tags", params.tags);
    }

    if (params.limit && params.limit > 0) {
      query = query.limit(params.limit);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || "Erro ao buscar memórias no Supabase.");
    }

    return (data ?? []) as MemoryRow[];
  }
}

export default SupabaseMemoryRepository;
