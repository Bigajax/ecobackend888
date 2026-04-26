import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";

export interface DreamRow {
  id: string;
  usuario_id: string;
  is_guest: boolean;
  dream_text: string;
  interpretation: string | null;
  tags: string[];
  created_at: string;
}

export interface DreamInsertPayload {
  usuario_id: string;
  is_guest: boolean;
  dream_text: string;
  interpretation?: string | null;
  tags?: string[];
}

type DreamsTableRow = {
  id: string;
  usuario_id: string;
  is_guest: boolean;
  dream_text: string;
  interpretation: string | null;
  tags: string[] | null;
  created_at: string;
};

function normalizeRow(row: DreamsTableRow): DreamRow {
  return {
    id: row.id,
    usuario_id: row.usuario_id,
    is_guest: row.is_guest,
    dream_text: row.dream_text,
    interpretation: row.interpretation,
    tags: Array.isArray(row.tags) ? row.tags : [],
    created_at: row.created_at,
  };
}

export async function insertDream(payload: DreamInsertPayload): Promise<DreamRow> {
  const admin = ensureSupabaseConfigured();
  const { data, error } = await admin
    .from("dreams")
    .insert([{ ...payload, tags: payload.tags ?? [] }])
    .select()
    .single();

  if (error) throw new Error(error.message || "Erro ao salvar sonho no Supabase.");
  if (!data) throw new Error("Erro ao salvar sonho: resposta vazia.");

  return normalizeRow(data as DreamsTableRow);
}

export async function updateDreamInterpretation(id: string, interpretation: string): Promise<void> {
  const admin = ensureSupabaseConfigured();
  const { error } = await admin
    .from("dreams")
    .update({ interpretation })
    .eq("id", id);

  if (error) {
    console.error("[supabaseDreamRepository] updateInterpretation error", error.message);
  }
}

export async function listDreamsByUser(
  usuarioId: string,
  limit = 20,
): Promise<DreamRow[]> {
  const admin = ensureSupabaseConfigured();
  const { data, error } = await admin
    .from("dreams")
    .select("id,usuario_id,is_guest,dream_text,interpretation,tags,created_at")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .range(0, limit - 1)
    .returns<DreamsTableRow[]>();

  if (error) {
    console.error("[supabaseDreamRepository] listDreamsByUser error", error.message);
    return [];
  }

  return Array.isArray(data) ? data.map(normalizeRow) : [];
}
