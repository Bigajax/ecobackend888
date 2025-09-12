// services/buscarReferenciasSemelhantes.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { embedTextoCompleto, unitNorm } from "./embeddingService";

export interface ReferenciaTemporaria {
  id: string;
  resumo_eco: string;
  tags?: string[];
  emocao_principal?: string;
  intensidade?: number;
  created_at?: string;
  similarity?: number;  // [0..1]
  distancia?: number;   // 1 - similarity
}

type BuscarRefsOpts = {
  texto?: string;
  userEmbedding?: number[]; // se vier, não recalcula (normaliza)
  k?: number;               // default 5
  threshold?: number;       // default 0.80
  daysBack?: number | null; // default 180; null = sem filtro
};

export async function buscarReferenciasSemelhantesV2(
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
  let daysBack: number | null = 180;

  if (typeof entradaOrOpts === "string") {
    texto = entradaOrOpts ?? "";
  } else {
    texto = entradaOrOpts.texto ?? "";
    userEmbedding = entradaOrOpts.userEmbedding;
    if (typeof entradaOrOpts.k === "number") k = entradaOrOpts.k;
    if (typeof entradaOrOpts.threshold === "number") threshold = entradaOrOpts.threshold;
    if (typeof entradaOrOpts.daysBack === "number" || entradaOrOpts.daysBack === null) {
      daysBack = entradaOrOpts.daysBack;
    }
  }

  if (!userId) return [];
  if (!userEmbedding && (!texto || texto.trim().length < 6)) return [];

  // ---------------------------
  // Embedding (gera OU reaproveita) + normalização
  // ---------------------------
  const queryEmbedding = userEmbedding?.length
    ? unitNorm(userEmbedding)
    : unitNorm(await embedTextoCompleto(texto, "refs.v2"));

  const match_count = Math.max(1, k);
  const match_threshold = Math.max(0, Math.min(1, Number(threshold) || 0.8));

  // Helper para chamar RPC
  const call = async (db: number | null) => {
    const { data, error } = await supabaseAdmin.rpc("buscar_referencias_similares_v2", {
      filtro_usuario: userId,
      query_embedding: queryEmbedding,
      match_count,
      match_threshold,
      days_back: db,
    });
    if (error) {
      console.warn("⚠️ RPC buscar_referencias_similares_v2 falhou:", {
        message: error.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      return [] as any[];
    }
    return (data ?? []) as any[];
  };

  // ---------------------------
  // Fallback temporal: 180d → sem filtro
  // ---------------------------
  let rows: any[] = [];
  const tryOrder: (number | null)[] = daysBack === null ? [null] : [daysBack ?? 180, null];

  for (const db of tryOrder) {
    rows = await call(db);
    if (rows && rows.length) break;
  }

  // ---------------------------
  // Normalização do retorno
  // ---------------------------
  return rows
    .filter((x) => (typeof x.similarity === "number" ? x.similarity : 0) >= match_threshold)
    .map((d) => ({
      id: d.id as string,
      resumo_eco: d.resumo_eco as string,
      tags: d.tags ?? undefined,
      emocao_principal: d.emocao_principal ?? undefined,
      intensidade: typeof d.intensidade === "number" ? d.intensidade : Number(d.intensidade),
      created_at: d.created_at as string | undefined,
      similarity:
        typeof d.similarity === "number"
          ? d.similarity
          : typeof d.similaridade === "number"
          ? d.similaridade
          : undefined,
      distancia:
        typeof d.distancia === "number"
          ? d.distancia
          : typeof d.similarity === "number"
          ? 1 - d.similarity
          : undefined,
    }))
    .slice(0, k);
}

// (Opcional) compat com nome antigo
export const buscarReferenciasSemelhantes = buscarReferenciasSemelhantesV2;
