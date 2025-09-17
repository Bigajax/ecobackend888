// services/derivadosService.ts

export type Efeito = 'abriu' | 'fechou' | 'neutro';

export interface EfeitoItem {
  x?: { efeito?: Efeito } | null;
}

export interface Marco {
  tema: string;
  resumo_evolucao?: string | null;
  marco_at?: string | null;
}

export interface TemaStat {
  tema: string;
  freq_30d?: number;
  int_media_30d?: number;
}

export interface Derivados {
  top_temas_30d: TemaStat[];
  marcos: { tema: string; resumo: string | null; marco_at: string | null }[];
  heuristica_interacao: {
    efeitos_ultimas_10: { abriu: number; fechou: number; neutro: number };
    media_score: number;
    dica_estilo: string;
  };
}

/** Util: garante array */
function ensureArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/** Util: número seguro */
function toNumber(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/** Gera dica rápida a partir de média de intensidade */
function dicaDeEstilo(media: number): string {
  if (media > 0.15) return 'compromissos concretos funcionam melhor';
  if (media < -0.15) return 'comece acolhendo antes de propor algo';
  return 'mantenha leve e curioso';
}

/**
 * Monta derivados a partir de dados crus já coletados
 * (stats, marcos, efeitos, média). Não faz IO aqui.
 */
export async function getDerivados(
  statsRaw: unknown,
  marcosRaw: unknown,
  efeitosRaw: unknown,
  mediaRaw: unknown
): Promise<Derivados> {
  // normalizações seguras
  const stats = ensureArray(statsRaw as TemaStat[]);
  const marcos = ensureArray(marcosRaw as Marco[]);
  const eff = ensureArray(efeitosRaw as EfeitoItem[]);
  const media = toNumber(mediaRaw, 0);

  const dica = dicaDeEstilo(media);

  // contagens protegidas (eff pode vir vazio)
  const abriu = eff.filter((i) => i?.x?.efeito === 'abriu').length;
  const fechou = eff.filter((i) => i?.x?.efeito === 'fechou').length;
  const neutro = eff.filter((i) => i?.x?.efeito === 'neutro').length;

  return {
    top_temas_30d: stats,
    marcos: marcos.map((m) => ({
      tema: m.tema,
      resumo: m.resumo_evolucao ?? null,
      marco_at: m.marco_at ?? null,
    })),
    heuristica_interacao: {
      efeitos_ultimas_10: { abriu, fechou, neutro },
      media_score: Number(media.toFixed(2)),
      dica_estilo: dica,
    },
  };
}

/** Insight curto para abrir a conversa (opcional) */
export function insightAbertura(der: Derivados | null): string | null {
  if (!der) return null;

  // 1) Se houver marco, prioriza
  if (der.marcos && der.marcos.length > 0) {
    const m = der.marcos[0];
    return m.resumo ?? `tema em destaque: "${m.tema}"`;
  }

  // 2) Caso contrário, usa tema recorrente dos últimos 30d
  if (der.top_temas_30d && der.top_temas_30d.length > 0) {
    const t = der.top_temas_30d[0];
    return `tema recorrente: "${t.tema}" (últimos 30d)`;
  }

  return null;
}
