import { createClient } from "@supabase/supabase-js";

export type Derivados = {
  top_temas_30d: { tema: string; freq_30d: number; int_media_30d: number|null; tendencia: string|null }[];
  marcos: { tema: string; resumo: string; marco_at: string }[];
  heuristica_interacao: { efeitos_ultimas_10: {abriu:number; fechou:number; neutro:number}, media_score:number, dica_estilo:string };
};

export async function getDerivados(userId: string, accessToken: string): Promise<Derivados> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: stats = [] } = await supabase
    .from("user_theme_stats")
    .select("tema,freq_30d,int_media_30d,tendencia")
    .eq("user_id", userId)
    .order("freq_30d", { ascending: false })
    .limit(5);

  const { data: marcos = [] } = await supabase
    .from("user_temporal_milestones")
    .select("tema,resumo_evolucao,marco_at")
    .eq("user_id", userId)
    .order("marco_at", { ascending: false })
    .limit(3);

  const { data: eff = [] } = await supabase
    .from("interaction_effects")
    .select("efeito,score")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const media = eff.length ? eff.reduce((a: number, e: any) => a + (e.score ?? 0), 0)/eff.length : 0;
  const dica =
    media >= 0.15 ? "compromissos concretos funcionam melhor" :
    media <= -0.15 ? "comece acolhendo antes de propor algo" :
    "mantenha leve e curioso";

  return {
    top_temas_30d: stats as any,
    marcos: marcos.map((m:any)=>({ tema:m.tema, resumo:m.resumo_evolucao, marco_at:m.marco_at })),
    heuristica_interacao: {
      efeitos_ultimas_10: {
        abriu:  eff.filter((x:any)=>x.efeito==='abriu').length,
        fechou: eff.filter((x:any)=>x.efeito==='fechou').length,
        neutro: eff.filter((x:any)=>x.efeito==='neutro').length,
      },
      media_score: Number(media.toFixed(2)),
      dica_estilo: dica,
    },
  };
}

/** escolhe 1 insight leve para a abertura opcional (híbrido) */
export function insightAbertura(der: Derivados): string|null {
  if (!der) return null;
  if (der.marcos?.length) return der.marcos[0].resumo;
  if (der.top_temas_30d?.length) {
    const t = der.top_temas_30d[0];
    return `tema recorrente: "${t.tema}" (últimos 30d)`;
  }
  return null;
}
