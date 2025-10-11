import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import type {
  MemoryInsertPayload,
  MemoryRepository,
  MemoryRow,
} from "../domains/memory/repository";

export interface ListMemoriesOptions {
  tags?: string[];
  limit?: number;
}

export async function insertMemory(
  table: string,
  payload: MemoryInsertPayload
): Promise<MemoryRow> {
  const admin = ensureSupabaseConfigured();
  const { data, error } = await admin
    .from(table)
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw new Error(error.message || "Erro ao salvar no Supabase.");
  }

  if (!data) {
    throw new Error("Erro ao salvar no Supabase: resposta vazia.");
  }

  return data;
}

export async function listMemories(
  usuarioId: string,
  options: ListMemoriesOptions = {}
): Promise<MemoryRow[]> {
  const admin = ensureSupabaseConfigured();
  const { tags = [], limit } = options;

  let query = admin
    .from("memories")
    .select("*")
    .eq("usuario_id", usuarioId)
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

  return (data ?? []) as MemoryRow[];
}

export class SupabaseMemoryRepository implements MemoryRepository {
  async save(table: string, payload: MemoryInsertPayload): Promise<MemoryRow> {
    return insertMemory(table, payload);
  }

  async list(params: {
    usuario_id: string;
    tags?: string[];
    limit?: number;
  }): Promise<MemoryRow[]> {
    return listMemories(params.usuario_id, {
      tags: params.tags,
      limit: params.limit,
    });
  }
}

export default SupabaseMemoryRepository;
