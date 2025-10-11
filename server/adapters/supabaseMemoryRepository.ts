import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import type { MemoryInsertPayload, MemoryRepository, MemoryRow } from "../domains/memory/repository";


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



    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || "Erro ao buscar memórias no Supabase.");
    }


  }
}

export default SupabaseMemoryRepository;
