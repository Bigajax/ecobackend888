import { supabaseAdmin } from '../lib/supabaseAdmin';

// 🎯 Mapeamento de aliases mais rico e variado
export const EMOTION_ALIASES: Record<string, string> = {
  alegria: 'feliz',
  alivio: 'calmo',
  angustia: 'angustia',
  ansiedade: 'ansiedade',
  compulsividade: 'irritado',
  confianca: 'confianca',
  conflito: 'conflito',
  confusao: 'confusao',
  desanimo: 'triste',
  desconexao: 'triste',
  desconfiança: 'medo',
  duvida: 'surpresa',
  esperanca: 'feliz',
  exaustao: 'irritado',
  expectativa: 'antecipacao',
  frustracao: 'raiva',
  nervosismo: 'ansiedade',
  nostalgia: 'nostalgia',
  pressao: 'irritado',
  realizacao: 'feliz',
  rejeicao: 'triste',
  satisfacao: 'feliz',
  saudade: 'nostalgia',
  sensacao_de_instabilidade: 'ansiedade',
  coragem: 'coragem'
};

// 🎯 Mapeamento de cores
const EMOTION_COLORS: Record<string, string> = {
  feliz: '#fcd34d',
  calmo: '#6ee7b7',
  triste: '#60a5fa',
  irritado: '#fda4af',
  medo: '#a78bfa',
  surpresa: '#f97316',
  antecipacao: '#38bdf8',
  raiva: '#f87171',
  outros: '#999999',
  // novas cores
  angustia: '#9CA3AF',
  ansiedade: '#C084FC',
  confusao: '#FCD34D',
  confianca: '#34D399',
  conflito: '#F87171',
  nostalgia: '#FBBF24',
  coragem: '#4ADE80'
};

// 🎯 Mapeamento com coordenadas adicionais
const EMOTION_MAP: Record<string, { valencia: number; excitacao: number }> = {
  feliz: { valencia: 0.8, excitacao: 0.7 },
  calmo: { valencia: 0.6, excitacao: -0.5 },
  triste: { valencia: -0.8, excitacao: -0.6 },
  irritado: { valencia: -0.7, excitacao: 0.9 },
  medo: { valencia: -0.6, excitacao: 0.8 },
  surpresa: { valencia: 0.1, excitacao: 0.9 },
  antecipacao: { valencia: 0.4, excitacao: 0.5 },
  raiva: { valencia: -0.7, excitacao: 0.9 },
  outros: { valencia: 0, excitacao: 0 },

  // novas emoções
  angustia: { valencia: -0.7, excitacao: 0.6 },
  ansiedade: { valencia: -0.5, excitacao: 0.8 },
  confusao: { valencia: -0.2, excitacao: 0.4 },
  confianca: { valencia: 0.7, excitacao: 0.3 },
  conflito: { valencia: -0.6, excitacao: 0.7 },
  nostalgia: { valencia: 0.2, excitacao: 0.2 },
  coragem: { valencia: 0.6, excitacao: 0.5 }
};

// ✅ Utils
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function agruparPorFrequencia(lista: string[]): Record<string, number> {
  return lista.reduce((acc, item) => {
    const chave = item.trim().toLowerCase();
    acc[chave] = (acc[chave] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function normalizar(valor: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (valor - min) / (max - min);
}

export async function gerarRelatorioEmocional(userId: string) {
  // 1️⃣ Buscar memórias do banco
  const { data: memorias, error } = await supabaseAdmin
    .from('memories')
    .select('emocao_principal, dominio_vida, intensidade, created_at, salvar_memoria, tags')
    .eq('usuario_id', userId)
    .eq('salvar_memoria', true);

  if (error || !memorias) throw new Error('Erro ao buscar memórias.');

  // 2️⃣ Filtrar memórias significativas
  const significativas = memorias.filter(m => m.intensidade && m.intensidade >= 7);

  const emocoes: string[] = [];
  const dominios: string[] = [];
  const tags: string[] = [];
  const linhaDoTempoArray: {
    data: string;
    emocao: string;
    intensidade: number;
    dominio: string;
    cor: string;
  }[] = [];

  const pontosEmocionais: { emocao: string, valencia: number, excitacao: number, cor: string }[] = [];

  // 🎯 Ajuste: jitter para espalhar pontos
  const jitterAmount = 0.2;

  // 3️⃣ Processar cada memória individualmente
  for (const mem of significativas) {
    if (!mem.emocao_principal || !mem.created_at) continue;

    const emocaoRaw = normalizarTexto(mem.emocao_principal.trim());
    const emocaoBase = EMOTION_ALIASES[emocaoRaw] || emocaoRaw;

    const dominio = mem.dominio_vida
      ? normalizarTexto(mem.dominio_vida.trim())
      : 'outros';

    const data = mem.created_at.slice(0, 10);

    emocoes.push(emocaoBase);
    dominios.push(dominio);
    if (mem.tags) tags.push(...mem.tags.map(t => normalizarTexto(t)));

    linhaDoTempoArray.push({
      data,
      emocao: emocaoBase,
      intensidade: mem.intensidade ?? 0,
      dominio,
      cor: EMOTION_COLORS[emocaoBase] || EMOTION_COLORS.outros
    });

    const coords = EMOTION_MAP[emocaoBase] || EMOTION_MAP.outros;
    const jitterX = (Math.random() - 0.5) * jitterAmount;
    const jitterY = (Math.random() - 0.5) * jitterAmount;

    pontosEmocionais.push({
      emocao: emocaoBase,
      valencia: coords.valencia + jitterX,
      excitacao: coords.excitacao + jitterY,
      cor: EMOTION_COLORS[emocaoBase] || EMOTION_COLORS.outros
    });
  }

  // 4️⃣ Calcular extremos para normalizar
  const valencias = pontosEmocionais.map(p => p.valencia);
  const excitacoes = pontosEmocionais.map(p => p.excitacao);

  const minValencia = Math.min(...valencias);
  const maxValencia = Math.max(...valencias);
  const minExcitacao = Math.min(...excitacoes);
  const maxExcitacao = Math.max(...excitacoes);

  // 5️⃣ Normalizar pontos para 0–1
  const mapaEmocionalNormalizado = pontosEmocionais.map(p => ({
    emocao: p.emocao,
    valenciaNormalizada: normalizar(p.valencia, minValencia, maxValencia),
    excitacaoNormalizada: normalizar(p.excitacao, minExcitacao, maxExcitacao),
    cor: p.cor
  }));

  // 6️⃣ Frequências
  const freqEmocoes = agruparPorFrequencia(emocoes);
  const freqDominios = agruparPorFrequencia(dominios);
  const freqTags = agruparPorFrequencia(tags);

  const emocoesDominantes = Object.entries(freqEmocoes)
    .sort((a, b) => b[1] - a[1])
    .map(([emocao, valor]) => ({
      emocao,
      valor,
      cor: EMOTION_COLORS[emocao] || EMOTION_COLORS.outros
    }));

  // 7️⃣ Resultado final
  return {
    emocoes_dominantes: emocoesDominantes,
    linha_do_tempo: linhaDoTempoArray,
    mapa_emocional_2d: mapaEmocionalNormalizado,
    dominios_dominantes: Object.entries(freqDominios).map(([dominio, valor]) => ({ dominio, valor })),
    tags_dominantes: Object.entries(freqTags).map(([tag, valor]) => ({ tag, valor })),
    total_memorias: significativas.length
  };
}
