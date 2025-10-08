import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";

export type MemoryTable = "memories" | "referencias_temporarias";

export interface MemoryInsert {
  usuario_id: string;
  mensagem_id?: string | null;
  resumo_eco: string;
  tags: string[];
  intensidade: number;
  emocao_principal?: string | null;
  contexto?: string | null;
  dominio_vida?: string | null;
  padrao_comportamental?: string | null;
  salvar_memoria: boolean;
  nivel_abertura: number;
  analise_resumo?: string | null;
  categoria: string;
  embedding: number[];
  embedding_emocional: number[];
}

export interface MemoryRow extends MemoryInsert {
  id?: string;
  created_at?: string;
}

export interface ListMemoriesOptions {
  tags?: string[];
  limit?: number;
}

export async function insertMemory(
  table: MemoryTable,
  payload: MemoryInsert
): Promise<MemoryRow[]> {
  const supabase = ensureSupabaseConfigured();
  const { data, error } = await supabase.from(table).insert([payload]).select();

  if (error) {
    throw new Error(error.message || "Erro ao salvar no Supabase.");
  }

  return (data ?? []) as MemoryRow[];
}

export async function listMemories(
  userId: string,
  options: ListMemoriesOptions
): Promise<MemoryRow[]> {
  const { tags = [], limit } = options;

  const supabase = ensureSupabaseConfigured();

  let query = supabase
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

  return (data ?? []) as MemoryRow[];
}
