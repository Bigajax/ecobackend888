// utils/relatorioEmocionalUtils.ts
import getSupabaseAdmin from "../lib/supabaseAdmin";

interface Memoria {
  emocao_principal?: string | null;
  dominio_vida?: string | null;
  intensidade?: number | null;
  created_at?: string | null;
  salvar_memoria?: boolean | null;
  tags?: string[] | null;
}

const mapaEmocionalBase: Record<string, { x: number; y: number }> = {
  feliz: { x: 1, y: 1 },
  calmo: { x: 0.5, y: -0.5 },
  triste: { x: -1, y: -1 },
  irritado: { x: -1, y: 1 },
  medo: { x: -0.5, y: 0.5 },
  surpresa: { x: 1, y: 0.5 },
  antecipacao: { x: 0.5, y: 0.5 },
  raiva: { x: -1, y: 1 },
};

function agruparPorFrequencia(lista: string[]): Record<string, number> {
  return lista.reduce((acc, item) => {
    const chave = item.trim().toLowerCase();
    acc[chave] = (acc[chave] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function gerarInsight(
  emocoesFreq: Record<string, number>,
  dominiosFreq: Record<string, number>
): string {
  const emocoes = Object.entries(emocoesFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  const dominios = Object.entries(dominiosFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  if (emocoes.length && dominios.length) {
    return (
      `Nos últimos tempos, emoções como ${emocoes.join(", ")} apareceram com frequência. ` +
      `Você também experienciou temas como ${dominios.join(", ")}. ` +
      `Esses elementos compõem um retrato emocional em movimento.`
    );
  } else if (emocoes.length) {
    return `As emoções mais presentes foram: ${emocoes.join(", ")}.`;
  } else {
    return "Ainda não há elementos suficientes para compor um retrato sensível do seu momento atual.";
  }
}

export async function gerarRelatorioEmocional(userId: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("memories")
    .select(
      "emocao_principal, dominio_vida, intensidade, created_at, salvar_memoria, tags"
    )
    .eq("usuario_id", userId)
    .eq("salvar_memoria", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[relatorioEmocional] erro ao buscar memórias:", error.message);
    throw new Error("Erro ao buscar memórias.");
  }

  const memorias: Memoria[] = (data ?? []) as Memoria[];

  const significativas = memorias.filter(
    (m: Memoria) => typeof m.intensidade === "number" && (m.intensidade as number) >= 7
  );

  const emocoes: string[] = [];
  const dominios: string[] = [];
  const tags: string[] = [];
  const linhaTempo: Record<string, Record<string, number>> = {};
  const mapaEmocional: { emocao: string; x: number; y: number }[] = [];

  for (const mem of significativas) {
    if (!mem.emocao_principal || !mem.created_at) continue;

    const emocao = mem.emocao_principal.trim().toLowerCase();
    const dominio = (mem.dominio_vida ?? "outros").trim().toLowerCase();
    const dataDia = mem.created_at.slice(0, 10);

    emocoes.push(emocao);
    dominios.push(dominio);
    if (Array.isArray(mem.tags)) {
      tags.push(
        ...mem.tags
          .map((t: string) => t.trim().toLowerCase())
          .filter(Boolean)
      );
    }

    if (!linhaTempo[dataDia]) linhaTempo[dataDia] = {};
    linhaTempo[dataDia][dominio] = (linhaTempo[dataDia][dominio] || 0) + 1;

    let base = mapaEmocionalBase[emocao];
    if (!base) {
      const randomX = (Math.random() * 2 - 1) * 0.7;
      const randomY = (Math.random() * 2 - 1) * 0.7;
      base = { x: randomX, y: randomY };
      mapaEmocionalBase[emocao] = base;
    }

    const intensidade = mem.intensidade ?? 7;
    const excitacao = (intensidade - 5) / 5; // [-1..1]
    const jitterX = (Math.random() - 0.5) * 0.3;
    const jitterY = (Math.random() - 0.5) * 0.3;

    mapaEmocional.push({
      emocao,
      x: Math.max(-1, Math.min(1, base.x + jitterX)),
      y: Math.max(-1, Math.min(1, excitacao + jitterY)),
    });
  }

  // Frequências consolidadas
  const freqEmocoes = agruparPorFrequencia(emocoes);
  const freqDominios = agruparPorFrequencia(dominios);
  const freqTags = agruparPorFrequencia(tags);

  const emocoesDominantes = Object.entries(freqEmocoes)
    .sort((a, b) => b[1] - a[1])
    .map(([emocao, valor]) => ({ emocao, valor }));

  const tagsDominantes = Object.entries(freqTags)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, valor]) => ({ tag, valor }));

  const linhaTempoArray = Object.entries(linhaTempo).map(
    ([dataItem, domMap]) => ({
      data: dataItem,
      ...domMap,
    })
  );

  return {
    mapa_emocional: mapaEmocional,
    emocoes_dominantes: emocoesDominantes,
    linha_do_tempo_intensidade: linhaTempoArray,
    tags_dominantes: tagsDominantes,
    insight_narrativo: gerarInsight(freqEmocoes, freqDominios),
    total_memorias: significativas.length,
  };
}
