// services/buscarReferenciasSemelhantes.ts
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { prepareQueryEmbedding } from "./prepareQueryEmbedding";

export interface ReferenciaTemporaria {
  id?: string;
  resumo_eco: string;
  tags?: string[];
  emocao_principal?: string;
  intensidade?: number;
  created_at?: string;
  similarity?: number;
  distancia?: number;
}

type BuscarRefsOpts = {
  texto?: string;
  userEmbedding?: number[];
  k?: number;          // default 5
  threshold?: number;  // default 0.80 (0..1)
};

const EMB_DIM = (() => {
  const raw = Number(process.env.SEMANTIC_MEMORY_EMBEDDING_DIMENSION ?? Number.NaN);
  return Number.isFinite(raw) && raw > 0 ? Number(raw) : 1536;
})(); // Ajusta dinamicamente a dimensão esperada do embedding e mantém compatibilidade com o índice vetorial

export async function buscarReferenciasSemelhantes(
  userId: string,
  entradaOrOpts: string | BuscarRefsOpts
): Promise<ReferenciaTemporaria[]> {
  try {
    // ---------------- Normalização de parâmetros ----------------
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

    // ---------------- Embedding (gera OU reaproveita) ----------------
    const queryEmbedding = await prepareQueryEmbedding({
      texto,
      userEmbedding,
      tag: "refs",
    });
    if (!queryEmbedding) return [];

    // ✅ (opcional) validar dimensão do vetor para evitar 42883/42804 no Postgres
    if (typeof EMB_DIM === "number" && queryEmbedding.length !== EMB_DIM) {
      console.warn(`Embedding dimension mismatch: expected ${EMB_DIM}, got ${queryEmbedding.length}`);
      return [];
    }

    const match_count = Math.max(1, k);
    const match_threshold = Math.min(1, Math.max(0, Number(threshold) || 0.8));

    // ---------------- RPC: buscar_referencias_similares ----------------
    const supabase = ensureSupabaseConfigured();

    const { data, error } = await supabase.rpc("buscar_referencias_similares", {
      filtro_usuario: userId,
      query_embedding: queryEmbedding, // array<number> -> Postgres vector
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

    // ---------------- Normalização do retorno ----------------
    return rows
      .map((d) => {
        const sim =
          typeof d.similarity === "number"
            ? d.similarity
            : typeof d.similaridade === "number"
            ? d.similaridade
            : undefined;

        const intensidadeNum =
          typeof d.intensidade === "number"
            ? d.intensidade
            : d.intensidade != null
            ? Number(d.intensidade)
            : undefined;

        return {
          id:
            typeof d.id === "string" && d.id.trim().length
              ? d.id.trim()
              : typeof d.referencia_id === "string" && d.referencia_id.trim().length
              ? d.referencia_id.trim()
              : undefined,
          resumo_eco: d.resumo_eco as string,
          tags: d.tags ?? undefined,
          emocao_principal: d.emocao_principal ?? undefined,
          intensidade: Number.isFinite(intensidadeNum) ? intensidadeNum : undefined,
          created_at: d.created_at as string | undefined,
          similarity: sim,
          distancia: typeof sim === "number" ? 1 - sim : undefined,
        } as ReferenciaTemporaria;
      })
      .filter((x) => (x.similarity ?? 0) >= match_threshold)
      .slice(0, k);
  } catch (e: any) {
    console.error("❌ Erro interno ao buscar referências:", e?.message ?? e);
    return [];
  }
}

// alias compat
export const buscarReferenciasSemelhantesV2 = buscarReferenciasSemelhantes;

