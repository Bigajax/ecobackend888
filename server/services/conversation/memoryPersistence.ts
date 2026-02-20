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

  // Guard: Validação crítica
  if (meta.intensidade < 7) {
    log.info("[salvarMemoriaViaRPC] Memória NÃO salva: intensidade < 7", {
      intensidade: meta.intensidade,
      threshold: 7,
      userId,
    });
    return { saved: false as const, primeira: false, memoriaId: null as string | null, memoryData: null };
  }

  log.info("[salvarMemoriaViaRPC] Iniciando salvamento de memória", {
    userId,
    intensidade: meta.intensidade,
    resumo_length: meta.resumo?.length ?? 0,
    tags_count: meta.tags?.length ?? 0,
    origem,
  });

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
    log.error("[registrar_memoria RPC] Erro ao salvar memória via RPC", {
      message: error.message,
      code: error.code,
      userId,
      intensidade: meta.intensidade,
    });
    return { saved: false as const, primeira: false, memoriaId: null as string | null, memoryData: null };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row || !row.id) {
    log.warn("[salvarMemoriaViaRPC] RPC retornou dados vazios ou sem ID", {
      rowPresent: !!row,
      hasId: !!row?.id,
      userId,
      intensidade: meta.intensidade,
    });
    return { saved: false as const, primeira: false, memoriaId: null as string | null, memoryData: null };
  }

  // Construir dados completos da memória para enviar ao cliente
  const memoryData = {
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
  };

  log.info("[salvarMemoriaViaRPC] Memória salva com sucesso", {
    memoriaId: row.id,
    primeiraMemoria: !!row?.primeira,
    userId,
    intensidade: meta.intensidade,
  });

  return {
    saved: true as const,
    primeira: !!row?.primeira,
    memoriaId: row?.id ?? null,
    memoryData,
  };
}
