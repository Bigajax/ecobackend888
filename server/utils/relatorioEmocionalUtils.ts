import { supabaseAdmin } from '../lib/supabaseAdmin';

interface Memoria {
  emocao_principal?: string;
  dominio_vida?: string;
  intensidade?: number;
  created_at?: string;
  salvar_memoria?: boolean;
  tags?: string[];
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

function gerarInsight(emocoesFreq: Record<string, number>, dominiosFreq: Record<string, number>): string {
  const emocoes = Object.entries(emocoesFreq).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const dominios = Object.entries(dominiosFreq).sort((a, b) => b[1] - a[1]).map(([k]) => k);

  if (emocoes.length && dominios.length) {
    return `Nos últimos tempos, emoções como ${emocoes.join(', ')} apareceram com frequência. ` +
           `Você também experienciou temas como ${dominios.join(', ')}. ` +
           `Esses elementos compõem um retrato emocional em movimento.`;
  } else if (emocoes.length) {
    return `As emoções mais presentes foram: ${emocoes.join(', ')}.`;
  } else {
    return 'Ainda não há elementos suficientes para compor um retrato sensível do seu momento atual.';
  }
}

export async function gerarRelatorioEmocional(userId: string) {
  const { data: memorias, error } = await supabaseAdmin
    .from('memories')
    .select('emocao_principal, dominio_vida, intensidade, created_at, salvar_memoria, tags')
    .eq('usuario_id', userId)
    .eq('salvar_memoria', true);

  if (error || !memorias) throw new Error('Erro ao buscar memórias.');

  const significativas = memorias.filter(m => m.intensidade && m.intensidade >= 7);

  const emocoes: string[] = [];
  const dominios: string[] = [];
  const tags: string[] = [];
  const linhaTempo: Record<string, Record<string, number>> = {};
  const mapaEmocional: { emocao: string; x: number; y: number }[] = [];

  for (const mem of significativas) {
    if (!mem.emocao_principal || !mem.created_at) continue;

    const emocao = mem.emocao_principal.trim().toLowerCase();
    const dominio = mem.dominio_vida?.trim().toLowerCase() || 'outros';
    const data = mem.created_at.slice(0, 10);

    emocoes.push(emocao);
    dominios.push(dominio);
    if (mem.tags) tags.push(...mem.tags.map((t: string) => t.trim().toLowerCase()));

    if (!linhaTempo[data]) linhaTempo[data] = {};
    linhaTempo[data][dominio] = (linhaTempo[data][dominio] || 0) + 1;

    if (mapaEmocionalBase[emocao]) {
      const base = mapaEmocionalBase[emocao];
      const intensidade = mem.intensidade ?? 7;

      // Mapeia intensidade 1–10 para -1 a +1
      const excitacao = (intensidade - 5) / 5;

      // Adiciona ruído para espalhamento visual
      const jitterX = (Math.random() - 0.5) * 0.3;
      const jitterY = (Math.random() - 0.5) * 0.3;

      mapaEmocional.push({
        emocao,
        x: Math.max(-1, Math.min(1, base.x + jitterX)),
        y: Math.max(-1, Math.min(1, excitacao + jitterY)),
      });
    }
  }

  const freqEmocoes = agruparPorFrequencia(emocoes);
  const freqDominios = agruparPorFrequencia(dominios);
  const freqTags = agruparPorFrequencia(tags);

  const emocoesDominantes = Object.entries(freqEmocoes).sort((a, b) => b[1] - a[1]).map(([emocao, valor]) => ({ emocao, valor }));
  const tagsDominantes = Object.entries(freqTags).sort((a, b) => b[1] - a[1]).map(([tag, valor]) => ({ tag, valor }));
  const linhaTempoArray = Object.entries(linhaTempo).map(([data, dominios]) => ({ data, ...dominios }));

  return {
    mapa_emocional: mapaEmocional,
    emocoes_dominantes: emocoesDominantes,
    linha_tempo: linhaTempoArray,
    tags_dominantes: tagsDominantes,
    insight_narrativo: gerarInsight(freqEmocoes, freqDominios),
    total_memorias: significativas.length,
  };
}
