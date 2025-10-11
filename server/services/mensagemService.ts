import type { AnySupabase } from "../adapters/SupabaseAdapter";

export interface MensagemRow {
  id: string;
  usuario_id: string;
  conteudo: string;
  data_hora: string | null;
  sentimento: string | null;
  salvar_memoria: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface MensagemInsertPayload {
  usuario_id: string;
  conteudo: string;
  data_hora?: string;
  sentimento?: string | null;
  salvar_memoria?: boolean;
}

export interface MensagemUpdatePayload {
  conteudo?: string;
  sentimento?: string | null;
  salvar_memoria?: boolean;
  data_hora?: string;
}

function normalizeInsertPayload(payload: MensagemInsertPayload) {
  const nowIso = new Date().toISOString();
  return {
    usuario_id: payload.usuario_id,
    conteudo: payload.conteudo,
    data_hora: payload.data_hora ?? nowIso,
    sentimento: payload.sentimento ?? null,
    salvar_memoria: payload.salvar_memoria ?? false,
  };
}

function normalizeUpdatePayload(payload: MensagemUpdatePayload): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  if (typeof payload.conteudo === "string") {
    updates.conteudo = payload.conteudo;
  }

  if (payload.sentimento !== undefined) {
    updates.sentimento = payload.sentimento;
  }

  if (typeof payload.salvar_memoria === "boolean") {
    updates.salvar_memoria = payload.salvar_memoria;
  }

  if (typeof payload.data_hora === "string" && payload.data_hora.trim().length > 0) {
    updates.data_hora = payload.data_hora;
  }

  return updates;
}

export async function registrarMensagem(
  supabase: AnySupabase,
  payload: MensagemInsertPayload
): Promise<MensagemRow> {
  const insertPayload = normalizeInsertPayload(payload);

  const { data, error } = await supabase
    .from("mensagem")
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    throw new Error(error.message || "Erro ao registrar mensagem.");
  }

  if (!data) {
    throw new Error("Erro ao registrar mensagem: resposta vazia.");
  }

  return data as MensagemRow;
}

export async function atualizarMensagem(
  supabase: AnySupabase,
  id: string,
  payload: MensagemUpdatePayload
): Promise<MensagemRow | null> {
  const updatePayload = normalizeUpdatePayload(payload);
  if (Object.keys(updatePayload).length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("mensagem")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Erro ao atualizar mensagem.");
  }

  return (data ?? null) as MensagemRow | null;
}

