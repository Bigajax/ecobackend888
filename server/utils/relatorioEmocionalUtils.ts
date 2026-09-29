// utils/relatorioEmocionalUtils.ts
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { normalizeToken } from "../services/emotionNormalization";

/**
 * Relatório emocional (set/2026): o que as memórias (intensidade >= 7) de um
 * período dizem, sem sorteio. Antes, o "mapa emocional" dava posição aleatória
 * à maioria das emoções em português e a "intensidade por dia" era contagem.
 *
 * Clima: tabela fixa de emoções leves e pesadas; o resto conta como misto.
 */
const LEVES = new Set(["alegria", "calma", "esperanca", "alivio", "amor", "gratidao", "compaixao", "surpresa"]);
const PESADAS = new Set([
  "tristeza",
  "raiva",
  "medo",
  "nojo",
  "ansiedade",
  "frustracao",
  "desespero",
  "vergonha",
  "culpa",
  "rejeicao",
  "solidao",
  "vazio",
  "dor",
  "ciumes",
]);

export type Clima = "leve" | "pesado" | "misto";

export function climaDaEmocao(emocao: string | null | undefined): Clima {
  const chave = normalizeToken(emocao ?? "");
  if (LEVES.has(chave)) return "leve";
  if (PESADAS.has(chave)) return "pesado";
  return "misto";
}

const DIA_MS = 24 * 60 * 60 * 1000;

function ranking(lista: string[], n: number) {
  const freq = new Map<string, { nome: string; vezes: number }>();
  for (const bruto of lista) {
    const nome = bruto.trim();
    if (!nome) continue;
    const chave = nome.toLowerCase();
    const atual = freq.get(chave);
    if (atual) atual.vezes += 1;
    else freq.set(chave, { nome, vezes: 1 });
  }
  return [...freq.values()].sort((a, b) => b.vezes - a.vezes).slice(0, n);
}

export async function gerarRelatorioEmocional(userId: string, dias = 30) {
  const periodo = Math.max(7, Math.min(365, Math.round(dias)));
  const desde = new Date(Date.now() - periodo * DIA_MS).toISOString();

  const { data, error } = await ensureSupabaseConfigured()
    .from("memories")
    .select("emocao_principal, dominio_vida, intensidade, created_at, tags")
    .eq("usuario_id", userId)
    .eq("salvar_memoria", true)
    .gte("intensidade", 7)
    .gte("created_at", desde)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Erro ao buscar memórias: ${error.message}`);
  const memorias = data ?? [];

  const porDia = new Map<string, { soma: number; memorias: number; clima: Record<Clima, number> }>();
  const clima: Record<Clima, number> = { leve: 0, pesado: 0, misto: 0 };

  for (const m of memorias) {
    if (!m.created_at) continue;
    const dia = m.created_at.slice(0, 10);
    const c = climaDaEmocao(m.emocao_principal);
    clima[c] += 1;
    const atual = porDia.get(dia) ?? { soma: 0, memorias: 0, clima: { leve: 0, pesado: 0, misto: 0 } };
    atual.soma += typeof m.intensidade === "number" ? m.intensidade : 7;
    atual.memorias += 1;
    atual.clima[c] += 1;
    porDia.set(dia, atual);
  }

  const emocoes = ranking(memorias.map((m) => m.emocao_principal ?? ""), 6);
  const temas = ranking(memorias.map((m) => (m.dominio_vida ?? "").replace(/_/g, " ")), 6);
  const tags = ranking(memorias.flatMap((m) => (Array.isArray(m.tags) ? m.tags : [])), 10);

  return {
    periodo_dias: periodo,
    total_memorias: memorias.length,
    dias: [...porDia.entries()].map(([data, d]) => ({
      data,
      memorias: d.memorias,
      intensidade_media: Math.round((d.soma / d.memorias) * 10) / 10,
      clima: (["pesado", "leve", "misto"] as Clima[]).reduce((a, b) => (d.clima[b] > d.clima[a] ? b : a), "misto"),
    })),
    clima,
    emocoes: emocoes.map((e) => ({ emocao: e.nome, vezes: e.vezes })),
    temas: temas.map((t) => ({ tema: t.nome, vezes: t.vezes })),
    tags: tags.map((t) => ({ tag: t.nome, vezes: t.vezes })),
    atualizado_em: new Date().toISOString(),
  };
}
