// services/heuristicaService.ts
import { supabase } from "../lib/supabaseAdmin";
import supabaseAdmin from "../lib/supabaseAdmin"; // para o hydrate simples do segundo helper
import { embedTextoCompleto, unitNorm } from "../adapters/embeddingService";
import { prepareQueryEmbedding } from "./prepareQueryEmbedding";

/** Resultado final (sem o vetor) */
export interface Heuristica {
  id: string;
  similarity: number; // [0..1]
  arquivo?: string | null;
  tags?: string[] | null;
  tipo?: string | null;
  origem?: string | null;
  usuario_id?: string | null;
}

export type BuscarHeuristicasInput = {
  texto?: string;
  usuarioId?: string | null;
  userEmbedding?: number[];   // se vier, não recalcula
  threshold?: number;         // default 0.80
  matchCount?: number;        // default 5
  hydrate?: boolean;          // default true
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
/** Implementação core: recebe já o embedding normalizado e executa a RPC + hydrate opcional */
async function _buscarHeuristicasCore(params: {
  queryEmbedding: number[];
  usuarioId: string | null;
  threshold: number;
  matchCount: number;
  hydrate: boolean;
}): Promise<Heuristica[]> {
  const { queryEmbedding, usuarioId, threshold, matchCount, hydrate } = params;

  const { data, error } = await supabase.rpc("buscar_heuristica_semelhante", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: matchCount,
    input_usuario_id: usuarioId,
  });

  if (error) {
    console.error("❌ RPC buscar_heuristica_semelhante:", error.message);
    return [];
  }

  const base = (data ?? []) as Array<{ id: string; similarity: number }>;
  if (!hydrate || base.length === 0) return base;

  const ids = base.map((r) => r.id);
  const { data: metas, error: metaErr } = await supabase
    .from("heuristicas_embeddings")
    .select("id, arquivo, tipo, origem, tags, usuario_id")
    .in("id", ids);

  if (metaErr) {
    console.warn("⚠️ Falha ao hidratar metadados de heurísticas:", metaErr.message);
    return base;
  }

  const idx = new Map((metas ?? []).map((m) => [m.id, m]));
  return base.map((r) => ({ ...r, ...(idx.get(r.id) ?? {}) }));
}

/** API rica (objeto ou string), mantém compat com sua chamada atual */
export async function buscarHeuristicasSemelhantes(
  input: string | BuscarHeuristicasInput,
  usuarioIdArg?: string | null,
  thresholdArg = 0.8,
  matchCountArg = 5
): Promise<Heuristica[]> {
  // normalização de parâmetros
  let texto = "";
  let userEmbedding: number[] | undefined;
  let usuarioId: string | null = null;
  let threshold = clamp01(Number(thresholdArg) || 0.8);
  let matchCount = Math.max(1, Number(matchCountArg) || 5);
  let hydrate = true;

  if (typeof input === "string") {
    texto = input ?? "";
    usuarioId = usuarioIdArg ?? null;
  } else {
    texto = input.texto ?? "";
    userEmbedding = input.userEmbedding;
    usuarioId = input.usuarioId ?? null;
    if (typeof input.threshold === "number") threshold = clamp01(input.threshold);
    if (typeof input.matchCount === "number") matchCount = Math.max(1, input.matchCount);
    if (typeof input.hydrate === "boolean") hydrate = input.hydrate;
  }

  if (!userEmbedding && (!texto || texto.trim().length < 6)) return [];

  // gera ou reaproveita embedding
  const queryEmbedding = await prepareQueryEmbedding({
    texto,
    userEmbedding,
    tag: "🔍 heuristica",
  });
  if (!queryEmbedding) return [];

  return _buscarHeuristicasCore({
    queryEmbedding,
    usuarioId,
    threshold,
    matchCount,
    hydrate,
  });
}

/** API simples (mensagem + log) — mantém comportamento do seu segundo bloco */
export async function buscarHeuristicaPorSimilaridade(
  mensagem: string,
  usuarioId?: string,
  threshold = 0.83,
  matchCount = 3
) {
  if (!mensagem?.trim()) return [];

  const queryEmbedding = unitNorm(await embedTextoCompleto(mensagem, "entrada_usuario"));

  const resultados = await _buscarHeuristicasCore({
    queryEmbedding,
    usuarioId: usuarioId ?? null,
    threshold: clamp01(threshold),
    matchCount: Math.max(1, matchCount),
    hydrate: false, // hidrataremos só arquivo para log
  });

  if (!resultados.length) {
    console.log("ℹ️ Nenhuma heurística fuzzy encontrada acima do threshold.");
    return [];
  }

  const ids = resultados.map((r) => r.id);
  const { data: metas } = await supabaseAdmin
    .from("heuristicas_embeddings")
    .select("id, arquivo")
    .in("id", ids);

  const idx = new Map((metas ?? []).map((m) => [m.id, m]));
  console.log(`✅ ${resultados.length} heurística(s) fuzzy encontradas:`);
  resultados.forEach((r, i) => {
    const arq = idx.get(r.id)?.arquivo ?? "(sem arquivo)";
    console.log(`• #${i + 1}: ${arq} (similarity: ${r.similarity.toFixed(3)})`);
  });

  return resultados.map((r) => ({ ...r, arquivo: idx.get(r.id)?.arquivo ?? null }));
}
