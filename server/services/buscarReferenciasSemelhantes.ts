// services/buscarReferenciasSemelhantes.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { embedTextoCompleto, unitNorm } from "./embeddingService";

export interface ReferenciaTemporaria {
  // ⚠️ Esta RPC não retorna id
  resumo_eco: string;
  tags?: string[];
  emocao_principal?: string;
  intensidade?: number;
  created_at?: string;
  similarity?: number;  // [0..1] (vem como similaridade/similarity)
  distancia?: number;   // 1 - similarity
}

type BuscarRefsOpts = {
  texto?: string;
  userEmbedding?: number[]; // se vier, normaliza
  k?: number;               // default 5
  threshold?: number;       // default 0.80
  // daysBack REMOVIDO: esta RPC não aceita filtro temporal
};

export async function buscarReferenciasSemelhantes(
  userId: string,
  entradaOrOpts: string | BuscarRefsOpts
): Promise<ReferenciaTemporaria[]> {
  // ---------------------------
  // Normalização de parâmetros
  // ---------------------------
  let texto = "";
  let userEmbedding: number[] | undefined;
  let k = 5;
  let threshold = 0.8;

  if (typeof entradaOrOpts === "string") {
    texto = entradaOrOpts ?? "";
  } else {
    texto = entradaOrOpts.texto ?? "";
    userEmbedding = entradaOrOpts.userEmbedding;
    if (typeof entradaOrOpts.k === "number") k = entradaOrOpts.k;
    if (typeof entradaOrOpts.threshold === "number") threshold = entradaOrOpts.threshold;
  }

  if (!userId) return [];
  if (!userEmbedding && (!texto || texto.trim().length < 6)) return [];

  // ---------------------------
  // Embedding (gera OU reaproveita) + normalização
  // ---------------------------
  const queryEmbedding = userEmbedding?.length
    ? unitNorm(userEmbedding)
    : unitNorm(await embedTextoCompleto(texto, "refs"));

  const match_count = Math.max(1, k);
  const match_threshold = Math.max(0, Math.min(1, Number(threshold) || 0.8));

  // ---------------------------
  // RPC existente: buscar_referencias_similares
  // ---------------------------
  const { data, error } = await supabaseAdmin.rpc("buscar_referencias_similares", {
    filtro_usuario: userId,
    query_embedding: queryEmbedding,
    match_count,
    match_threshold,
  });

  if (error) {
    console.warn("⚠️ RPC buscar_referencias_similares falhou:", {
      message: error.message,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
    return [];
  }

  const rows = (data ?? []) as any[];

  // ---------------------------
  // Normalização do retorno
  // ---------------------------
  return rows
    .map((d) => {
      const sim =
        typeof d.similarity === "number"
          ? d.similarity
          : typeof d.similaridade === "number"
          ? d.similaridade
          : undefined;

      return {
        resumo_eco: d.resumo_eco as string,
        tags: d.tags ?? undefined,
        emocao_principal: d.emocao_principal ?? undefined,
        intensidade: typeof d.intensidade === "number" ? d.intensidade : Number(d.intensidade),
        created_at: d.created_at as string | undefined,
        similarity: sim,
        distancia: typeof sim === "number" ? 1 - sim : undefined,
      } as ReferenciaTemporaria;
    })
    .filter((x) => (x.similarity ?? 0) >= match_threshold)
    .slice(0, k);
}

// alias compat com seu código anterior V2 (se algum lugar importar V2)
export const buscarReferenciasSemelhantesV2 = buscarReferenciasSemelhantes;
