import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareQueryEmbedding } from "../prepareQueryEmbedding";
import {
  buscarMemoriasSemelhantesV2,
  type BuscarMemoriasSemelhantesParams,
  type SemanticMemoryRow,
} from "./semanticMemoryClient";

export type RetrieveMode = "FAST" | "DEEP";

export interface BuscarMemoriasComModoArgs {
  userId: string;
  embedding: number[];
  mode: RetrieveMode;
  filtros?: {
    currentMemoryId?: string | null;
    userIdUsedForInsert?: string | null;
    authUid?: string | null;
  };
  supabaseClient?: SupabaseClient;
}

export type MemoriaSemantica = SemanticMemoryRow;

export async function buscarMemoriasComModo({
  userId,
  embedding,
  filtros,
  supabaseClient,
}: BuscarMemoriasComModoArgs): Promise<MemoriaSemantica[]> {
  if (!Array.isArray(embedding) || embedding.length === 0) return [];
  const queryEmbedding = await prepareQueryEmbedding({ userEmbedding: embedding });
  if (!queryEmbedding) return [];

  const params: BuscarMemoriasSemelhantesParams = {
    userId,
    queryEmbedding,
    currentMemoryId: filtros?.currentMemoryId ?? null,
    supabaseClient,
    userIdUsedForInsert: filtros?.userIdUsedForInsert ?? userId,
    authUid: filtros?.authUid ?? null,
  };

  const { rows } = await buscarMemoriasSemelhantesV2(params);
  return rows;
}

export const retrieveConfigs = { FAST: { k: 5 }, DEEP: { k: 5 } } as const;
