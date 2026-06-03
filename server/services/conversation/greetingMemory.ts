// services/conversation/greetingMemory.ts
// Tema leve para a abertura da Eco "lembrar como uma pessoa" (sem dossiê, sem datas).
// Determinístico: deriva 1 tema legível da memória recente marcante (intensidade ≥ 7).

const MIN_INTENSIDADE_MARCANTE = 7;
const TEMA_MAX_LEN = 40;

// Tags genéricas demais para virar tema ("aquilo de outros" não diz nada).
const TAGS_GENERICAS = new Set<string>(["outros", "geral", "diversos", "indefinida", "indefinido"]);

function limparTag(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Deriva um tema curto e legível das tags da memória, ou null se nada utilizável.
 * Prefere 1 tag saliente; se a primeira for muito curta, junta 2 para dar contexto.
 */
export function temaDaMemoria(mem: { tags?: unknown } | null | undefined): string | null {
  if (!mem) return null;
  const raw = Array.isArray(mem.tags) ? mem.tags : [];
  const limpas = raw
    .map(limparTag)
    .filter((t) => t.length > 0 && !TAGS_GENERICAS.has(t));

  if (limpas.length === 0) return null;

  // 1 tag basta; se for muito curtinha (ex.: "app"), junta a próxima para dar corpo.
  let tema = limpas[0];
  if (tema.length <= 4 && limpas[1]) {
    tema = `${limpas[0]} e ${limpas[1]}`;
  }

  if (tema.length > TEMA_MAX_LEN) return null;
  return tema;
}

type RecentMemoryQueryable = {
  from: (table: string) => any;
};

/**
 * Busca a memória mais recente do usuário com intensidade ≥ 7 e devolve um tema legível.
 * Reusa o padrão de MemoryService (order by created_at desc, limit 1, maybeSingle).
 * Nunca lança: qualquer erro vira null (a saudação neutra segue normalmente).
 */
export async function fetchTemaRecenteMarcante(
  supabase: RecentMemoryQueryable | null | undefined,
  userId: string | null | undefined
): Promise<string | null> {
  if (!supabase || !userId) return null;
  try {
    const { data } = await supabase
      .from("memories")
      .select("tags, intensidade, created_at")
      .eq("usuario_id", userId)
      .gte("intensidade", MIN_INTENSIDADE_MARCANTE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return temaDaMemoria(data as { tags?: unknown } | null);
  } catch {
    return null;
  }
}
