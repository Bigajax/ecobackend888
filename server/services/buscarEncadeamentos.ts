// services/buscarEncadeamentos.ts
import { createClient } from "@supabase/supabase-js";
import { prepareQueryEmbedding } from "./prepareQueryEmbedding";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export type MemoriaEncadeada = {
  id: string;
  referencia_anterior_id: string | null;
  created_at: string;
  resumo_eco: string;
};

// Opções para reaproveitar embedding e controlar limites
type BuscarEncadeamentosOpts = {
  texto?: string;             // usado se não houver userEmbedding
  userEmbedding?: number[];   // se vier, NÃO recalcula (normaliza)
  kBase?: number;             // quantas memórias-base procurar (default 1)
  threshold?: number;         // similaridade mínima [0..1], default 0.80
  daysBack?: number | null;   // janela em dias (default 90). null = sem filtro
};

export async function buscarEncadeamentosPassados(
  userId: string,
  entradaOrOpts: string | BuscarEncadeamentosOpts
): Promise<MemoriaEncadeada[]> {
  try {
    if (!userId) return [];

    // ---------------------------
    // Normalização de parâmetros
    // ---------------------------
    let texto = "";
    let userEmbedding: number[] | undefined;
    let kBase = 1;
    let threshold = 0.8;
    let daysBack: number | null = 90;

    if (typeof entradaOrOpts === "string") {
      texto = entradaOrOpts ?? "";
    } else {
      texto = entradaOrOpts.texto ?? "";
      userEmbedding = entradaOrOpts.userEmbedding;
      if (typeof entradaOrOpts.kBase === "number") kBase = entradaOrOpts.kBase;
      if (typeof entradaOrOpts.threshold === "number")
        threshold = Math.max(0, Math.min(1, entradaOrOpts.threshold));
      if (typeof entradaOrOpts.daysBack === "number" || entradaOrOpts.daysBack === null)
        daysBack = entradaOrOpts.daysBack;
    }

    // Evita custo se não tiver embedding e o texto for muito curto
    if (!userEmbedding && (!texto || texto.trim().length < 6)) {
      console.warn("⚠️ Entrada muito curta e sem embedding — pulando encadeamento.");
      return [];
    }

    // ---------------------------
    // Gera OU reaproveita o embedding (e normaliza)
    // ---------------------------
    const consulta_embedding = await prepareQueryEmbedding({
      texto,
      userEmbedding,
      tag: "🔗 encadeamento",
    });
    if (!consulta_embedding) return [];

    // ---------------------------
    // 1) Busca memória base mais similar do usuário (RPC v2)
    // ---------------------------
    const match_count = Math.max(1, kBase);
    const match_threshold = threshold;

    const call = async (db: number | null) => {
      const { data, error } = await supabase.rpc(
        "buscar_memorias_semelhantes_v2",
        {
          query_embedding: consulta_embedding,
          user_id_input: userId,
          match_count,
          match_threshold,
          days_back: db, // inteiro (dias) ou null
        }
      );
      if (error) {
        console.error("❌ Erro RPC buscar_memorias_semelhantes_v2:", {
          message: error.message,
          details: (error as any)?.details ?? null,
          hint: (error as any)?.hint ?? null,
        });
        return [] as any[];
      }
      return (data ?? []) as any[];
    };

    // Fallback temporal: daysBack → 180 → sem filtro
    let baseRows: any[] = [];
    const tryOrder: (number | null)[] =
      daysBack === null ? [null] : [daysBack ?? 90, 180, null];

    for (const db of tryOrder) {
      baseRows = await call(db);
      if (baseRows.length) break;
    }

    if (!baseRows.length) {
      console.warn("⚠️ Nenhuma memória similar encontrada para o encadeamento.");
      return [];
    }

    // pega a primeira memória-base (mais similar)
    const memoriaBaseId = baseRows[0]?.id as string | undefined;
    if (!memoriaBaseId) {
      console.warn("⚠️ Memória similar sem id — abortando encadeamento.");
      return [];
    }

    // ---------------------------
    // 2) Busca encadeamento recursivo a partir da memória encontrada
    // ---------------------------
    const { data: encadeamentos, error: erroEncadeamento } = await supabase.rpc(
      "buscar_encadeamentos_memorias",
      { raiz_id: memoriaBaseId }
    );

    if (erroEncadeamento) {
      console.error("❌ Erro ao buscar encadeamentos (RPC buscar_encadeamentos_memorias):", {
        message: erroEncadeamento.message,
        details: (erroEncadeamento as any).details ?? null,
        hint: (erroEncadeamento as any).hint ?? null,
      });
      return [];
    }

    return (encadeamentos as MemoriaEncadeada[]) ?? [];
  } catch (e) {
    console.error("❌ Erro inesperado ao buscar encadeamentos:", (e as Error).message);
    return [];
  }
}
