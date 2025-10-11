import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import type { MemoryInsertPayload, MemoryRepository, MemoryRow } from "../domains/memory/repository";

const MAX_LIST_LIMIT = 100;

function normalizeRow(row: Record<string, unknown>): MemoryRow {
  const id = row.id != null ? String(row.id) : "";
  if (!id) {
    throw new Error("Supabase insert did not return an id.");
  }

  const rawTexto = row.texto;
  const intensidadeValue = row.intensidade;
  const rawTags = row.tags;
  const rawUsuarioId = row.usuario_id;
  const createdAtValue = row.created_at;

  const normalized: MemoryRow = {
    ...(row as Record<string, unknown>),
    id,
    texto:
      typeof rawTexto === "string"
        ? rawTexto
        : rawTexto == null
        ? null
        : String(rawTexto),
    intensidade:
      typeof intensidadeValue === "number"
        ? intensidadeValue
        : Number(intensidadeValue ?? 0),
    tags: Array.isArray(rawTags)
      ? (rawTags as unknown[]).map((tag) => String(tag))
      : [],
    usuario_id: typeof rawUsuarioId === "string" ? rawUsuarioId : String(rawUsuarioId ?? ""),
    created_at:
      typeof createdAtValue === "string"
        ? createdAtValue
        : new Date().toISOString(),
  } as MemoryRow;

  return normalized;
}

export class SupabaseMemoryRepository implements MemoryRepository {
  async save(table: string, payload: MemoryInsertPayload): Promise<MemoryRow> {
    const admin = ensureSupabaseConfigured();
    const { data, error } = await admin.from(table).insert(payload).select("*").single();
    if (error) {
      throw new Error(error.message || "Erro ao salvar no Supabase.");
    }
    if (!data) {
      throw new Error("Supabase retornou resposta vazia no insert.");
    }
    return normalizeRow(data as Record<string, unknown>);
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

    const requestedLimit = params.limit ?? MAX_LIST_LIMIT;
    const sanitizedLimit = Math.min(
      requestedLimit > 0 ? requestedLimit : MAX_LIST_LIMIT,
      MAX_LIST_LIMIT
    );
    const limit = Math.max(sanitizedLimit, 1);
    query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || "Erro ao buscar memórias no Supabase.");
    }

    return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
  }
}

export default SupabaseMemoryRepository;
