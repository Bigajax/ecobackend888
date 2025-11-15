import { log } from "../promptContext/logger";

import type { EcoStreamMetaPayload } from "./types";

/** Salva memória via RPC registrar_memoria (idempotente para milestone) e
 * retorna se é a primeira memória >=7 para o usuário (primeira = true). */
export async function salvarMemoriaViaRPC(opts: {
  supabase: any;
  userId: string;
  mensagemId?: string | null;
  meta: EcoStreamMetaPayload;
  origem?: string;
}) {
  const { supabase, userId, mensagemId, meta, origem = "streaming_bloco" } = opts;

  if (meta.intensidade < 7) {
    return { saved: false as const, primeira: false, memoriaId: null as string | null, memoryData: null };
  }

  const { data, error } = await supabase.rpc("registrar_memoria", {
    p_usuario: userId,
    p_texto: meta.resumo ?? "",
    p_intensidade: meta.intensidade,
    p_tags: meta.tags && meta.tags.length ? meta.tags : null,
    p_dominio_vida: meta.categoria ?? null,
    p_padrao_comportamental: null,
    p_meta: {
      origem,
      mensagem_id: mensagemId ?? null,
      emocao_principal: meta.emocao ?? null,
    },
  });

  if (error) {
    log.warn("[registrar_memoria RPC] erro ao salvar memoria", { message: error.message });
    return { saved: false as const, primeira: false, memoriaId: null as string | null, memoryData: null };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // Construir dados completos da memória para enviar ao cliente
  const memoryData = row && row.id ? {
    id: row.id,
    usuario_id: userId,
    resumo_eco: meta.resumo ?? "",
    emocao_principal: meta.emocao ?? "indefinida",
    intensidade: meta.intensidade,
    contexto: meta.analise_resumo ?? "",
    dominio_vida: meta.categoria ?? null,
    padrao_comportamental: null,
    categoria: meta.categoria ?? null,
    nivel_abertura: meta.nivel_abertura ?? null,
    analise_resumo: meta.analise_resumo ?? "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    created_at: row.created_at ?? new Date().toISOString(),
  } : null;

  return {
    saved: true as const,
    primeira: !!row?.primeira,
    memoriaId: row?.id ?? null,
    memoryData,
  };
}
