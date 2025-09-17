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

/* Utils seguras */
function ensureArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}
function toNumber(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}
function dicaDeEstilo(media: number): string {
  if (media > 0.15) return 'compromissos concretos funcionam melhor';
  if (media < -0.15) return 'comece acolhendo antes de propor algo';
  return 'mantenha leve e curioso';
}

/** Núcleo que monta o objeto Derivados (não faz IO) */
async function getDerivadosInternal(
  statsRaw: unknown,
  marcosRaw: unknown,
  efeitosRaw: unknown,
  mediaRaw: unknown
): Promise<Derivados> {
  const stats = ensureArray(statsRaw as TemaStat[]);
  const marcos = ensureArray(marcosRaw as Marco[]);
  const eff = ensureArray(efeitosRaw as EfeitoItem[]);
  const media = toNumber(mediaRaw, 0);

  const abriu  = eff.filter((i) => i?.x?.efeito === 'abriu').length;
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
      dica_estilo: dicaDeEstilo(media),
    },
  };
}

/**
 * API pública RETROCOMPATÍVEL:
 * - Novo formato: getDerivados(stats, marcos, efeitos, media)
 * - Formato antigo (2 args): getDerivados(efeitos, marcos)
 *   (stats=[], media=0 por padrão)
 */
export async function getDerivados(
  a?: unknown,
  b?: unknown,
  c?: unknown,
  d?: unknown
): Promise<Derivados> {
  // 4 argumentos → caminho novo
  if (arguments.length >= 3) {
    return getDerivadosInternal(a, b, c, d);
  }
  // 2 argumentos → compat com chamadas antigas (efeitos, marcos)
  if (arguments.length === 2) {
    const efeitos = a;
    const marcos  = b;
    return getDerivadosInternal([], marcos, efeitos, 0);
  }
  // Nenhum/1 argumento → defaults seguros
  return getDerivadosInternal([], [], [], 0);
}

/** Insight curto para abrir a conversa (opcional) */
export function insightAbertura(der: Derivados | null): string | null {
  if (!der) return null;
  if (der.marcos && der.marcos.length > 0) {
    const m = der.marcos[0];
    return m.resumo ?? `tema em destaque: "${m.tema}"`;
  }
  if (der.top_temas_30d && der.top_temas_30d.length > 0) {
    const t = der.top_temas_30d[0];
    return `tema recorrente: "${t.tema}" (últimos 30d)`;
  }
  return null;
}
