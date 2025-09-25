// services/buscarHeuristicas.ts
import { supabase } from "../lib/supabaseAdmin"; // ✅ instância singleton
import { embedTextoCompleto, unitNorm } from "./embeddingService";

/** Formato das heurísticas retornadas (sem o vetor de embedding). */
interface Heuristica {
  id: string;
  arquivo?: string | null;
  tags?: string[] | null;
  tipo?: string | null;
  origem?: string | null;
  usuario_id?: string | null;
  similarity: number; // 0..1 (da RPC)
}

/** Assinatura nova (opcional) por objeto */
type BuscarHeuristicasInput = {
  texto?: string;
  usuarioId?: string | null;
  userEmbedding?: number[];   // ✅ se vier, não recalcula (normaliza)
  threshold?: number;         // default 0.80
  matchCount?: number;        // default 5
  hydrate?: boolean;          // default true (busca metadados após a RPC)
};

/**
 * Busca heurísticas semânticas semelhantes usando embeddings.
 *
 * Antigo:
 *   buscarHeuristicasSemelhantes("texto", userId, 0.75, 5)
 *
 * Novo:
 *   buscarHeuristicasSemelhantes({ userEmbedding, usuarioId: userId, matchCount: 5 })
 */
export async function buscarHeuristicasSemelhantes(
  input: string | BuscarHeuristicasInput,
  usuarioId?: string | null,
  threshold = 0.8,
  matchCount = 5
): Promise<Heuristica[]> {
  try {
    // ---------------------------
    // Normalização de parâmetros
    // ---------------------------
    let texto = "";
    let userEmbedding: number[] | undefined;
    let uid: string | null = null;
    let th = clamp01(Number(threshold) || 0.8);
    let k = Math.max(1, Number(matchCount) || 5);
    let hydrate = true;

    if (typeof input === "string") {
      // modo antigo
      texto = input ?? "";
      uid = usuarioId ?? null;
    } else {
      // modo novo
      texto = input.texto ?? "";
      userEmbedding = input.userEmbedding;
      uid = input.usuarioId ?? null;
      if (typeof input.threshold === "number") th = clamp01(input.threshold);
      if (typeof input.matchCount === "number") k = Math.max(1, input.matchCount);
      if (typeof input.hydrate === "boolean") hydrate = input.hydrate;
    }

    // Guard: sem embedding e texto curto → pula
    if (!userEmbedding && (!texto || texto.trim().length < 6)) {
      console.warn("⚠️ Texto curto e nenhum embedding fornecido — pulando busca de heurísticas.");
      return [];
    }

    // ---------------------------
    // Gera OU reaproveita o embedding (e normaliza)
    // ---------------------------
    let query_embedding: number[];
    if (userEmbedding?.length) {
      const ue = toNumberArray(userEmbedding);
      if (!ue) return [];
      query_embedding = unitNorm(ue);
    } else {
      const raw = await embedTextoCompleto(texto, "🔍 heuristica");
      const parsed = Array.isArray(raw) ? raw : safeJsonArray(raw);
      const num = toNumberArray(parsed);
      if (!num) return [];
      query_embedding = unitNorm(num);
    }

    // ---------------------------
    // RPC (args devem bater com a função SQL existente)
    // public.buscar_heuristica_semelhante(
    //   input_usuario_id uuid, match_count int, match_threshold double precision, query_embedding vector
    // ) RETURNS TABLE(id uuid, similarity double precision)
    // ---------------------------
    const { data, error } = await supabase.rpc(
      "buscar_heuristica_semelhante",
      {
        input_usuario_id: uid,
        match_count: k,
        match_threshold: th,
        query_embedding,
      } as any // caso os tipos gerados ainda não incluam a RPC
    );

    if (error) {
      console.error("❌ Erro RPC buscar_heuristica_semelhante:", {
        message: error.message,
        details: (error as any)?.details ?? null,
        hint: (error as any)?.hint ?? null,
      });
      return [];
    }

    const base = ((data ?? []) as Array<{ id: string; similarity: number }>).filter(
      (r) => typeof r.similarity === "number" && r.similarity >= th
    );

    if (base.length === 0) return [];

    // ---------------------------
    // (Opcional) Hydrate: buscar metadados na tabela
    // Evitamos selecionar o campo "embedding" pra não pesar.
    // ---------------------------
    if (!hydrate) {
      // retorna só id + similarity
      return base.map((r) => ({ id: r.id, similarity: r.similarity } as Heuristica));
    }

    const ids = base.map((r) => r.id);

    // Atenção ao RLS: supabaseAdmin deve ter permissão de leitura.
    const { data: metas, error: metaErr } = await supabase
      .from("heuristicas_embeddings")
      .select("id, arquivo, tipo, origem, tags, usuario_id")
      .in("id", ids);

    if (metaErr) {
      console.warn("⚠️ Falha ao hidratar metadados de heurísticas:", {
        message: metaErr.message,
        details: (metaErr as any)?.details ?? null,
        hint: (metaErr as any)?.hint ?? null,
      });
      // devolve só o básico
      return base.map((r) => ({ id: r.id, similarity: r.similarity } as Heuristica));
    }

    // index para merge O(1)
    const metaIndex = new Map<string, any>((metas ?? []).map((m) => [m.id, m]));

    // merge mantendo a ordem da RPC
    const merged: Heuristica[] = base.map((r) => {
      const m = metaIndex.get(r.id);
      return {
        id: r.id,
        similarity: r.similarity,
        arquivo: m?.arquivo ?? null,
        tipo: m?.tipo ?? null,
        origem: m?.origem ?? null,
        tags: m?.tags ?? null,
        usuario_id: m?.usuario_id ?? null,
      };
    });

    return merged;
  } catch (err: any) {
    console.error(
      "❌ Erro inesperado ao gerar/usar embedding ou buscar heurísticas:",
      err?.message ?? err
    );
    return [];
  }
}

/* --------------------------------- helpers -------------------------------- */

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/** Tenta parsear JSON em array (quando `embedTextoCompleto` retorna string JSON). */
function safeJsonArray(v: unknown): unknown[] | null {
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Converte um array desconhecido em `number[]`, descartando valores não numéricos/NaN.
 * Retorna `null` se não conseguir produzir pelo menos 2 números válidos.
 */
function toNumberArray(arr: unknown): number[] | null {
  if (!Array.isArray(arr)) return null;
  const nums = arr
    .map((x) => (typeof x === "number" ? x : Number(x)))
    .filter((x) => Number.isFinite(x));
  return nums.length >= 2 ? nums : null;
}
