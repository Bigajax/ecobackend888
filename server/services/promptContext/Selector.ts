// server/services/promptContext/Selector.ts

export type Flags = {
  curiosidade: boolean;
  pedido_pratico: boolean;
  duvida_classificacao: boolean;
};

export type BaseSelection = {
  nivel: 1 | 2 | 3;
  intensidade: number;
  flags: Flags;
  raw: string[];
  posGating: string[];
  priorizado: string[];
  cortados: string[];
};

/* ================= NV1 (mínimo) ================= */
const NV1_MINIMAL: string[] = [
  "NV1_CORE.txt",
  "IDENTIDADE_MINI.txt",
  "ANTISALDO_MIN.txt",
];

/* ========== Base NV2/NV3 (enxuta, sem módulos longos) ========== */
const BASE_GENERAL: string[] = [
  "IDENTIDADE.txt",
  "MODULACAO_TOM_REGISTRO.txt",
  "ENCERRAMENTO_SENSIVEL.txt",
  "ESCALA_ABERTURA_1a3.txt",
  "ESCALA_INTENSIDADE_0a10.txt",
  // longos/avançados entram por gating:
  // "METODO_VIVA_ENXUTO.txt",
  // "BLOCO_TECNICO_MEMORIA.txt",
];

const LONG_FORM: string[] = [
  "METODO_VIVA_ENXUTO.txt",
  "BLOCO_TECNICO_MEMORIA.txt",
];

/* --------- Heurísticas simples --------- */

export function detectarSaudacaoBreve(texto?: string): boolean {
  const t = (texto || "").trim();
  if (!t) return true;
  const words = t.split(/\s+/).filter(Boolean);
  const curto = t.length <= 18 || words.length <= 3;
  const temSaud = /\b(oi|olá|ola|hey|e?a[iy]|bom dia|boa tarde|boa noite)\b/i.test(t);
  const leve = /^[\w\sáéíóúâêôãõç!?.,…-]{0,40}$/i.test(t);
  return (temSaud && curto) || (curto && leve);
}

function isIntense(text: string): boolean {
  const t = text.toLowerCase();
  const gatilhos = [
    /p[aâ]nico/,
    /crise/,
    /desesper/,
    /insuport/,
    /vontade de sumir/,
    /explod/,
    /taquicard|batimentos/i,
    /ansiedad|ang[uú]st/i,
  ];
  const longo = t.length >= 180;
  return longo || gatilhos.some((r) => r.test(t));
}

// Intensidade nominal 0–10 (proxy rápido)
export function estimarIntensidade0a10(text: string): number {
  if (!text.trim()) return 0;
  const base = isIntense(text) ? 7 : 3;
  const extra = Math.min(3, Math.floor(text.length / 200));
  return Math.max(0, Math.min(10, base + extra));
}

/* --------- Nível de abertura --------- */

export function derivarNivel(texto: string, saudacaoBreve: boolean): 1 | 2 | 3 {
  if (saudacaoBreve) return 1;
  const len = (texto || "").trim().length;
  if (len < 120) return 1;
  if (len < 300) return 2;
  return 3;
}

/* --------- Flags --------- */

export function derivarFlags(texto: string): Flags {
  const t = (texto || "").toLowerCase();
  const curiosidade =
    /\b(como|por que|porque|pra que|para que|e se|poderia|podes|pode)\b/.test(t) ||
    /\?$/.test(t);
  const pedido_pratico =
    /\b(passos?|tutorial|guia|checklist|lista|exemplo|modelo|template|o que faço|o que fazer|me ajuda)\b/.test(
      t
    );
  const duvida_classificacao =
    /\b(n[ií]vel|abertura|intensidade|classifica[cç][aã]o|classificar)\b/.test(t);
  return { curiosidade, pedido_pratico, duvida_classificacao };
}

/* --------- Seleção base com gating --------- */

export const Selector = {
  derivarFlags,

  selecionarModulosBase({
    nivel,
    intensidade,
    flags,
  }: {
    nivel: 1 | 2 | 3;
    intensidade: number;
    flags: Flags;
  }): BaseSelection {
    // 1) Lista inicial
    const raw = nivel === 1 ? NV1_MINIMAL.slice() : BASE_GENERAL.slice();

    // 2) Gating por intensidade (longos só com intensidade >=7 e NV >=2)
    const gated = raw.slice();
    const cortados: string[] = [];

    const allowLong = intensidade >= 7 && nivel >= 2;
    if (allowLong) {
      for (const lf of LONG_FORM) gated.push(lf);
    } else {
      for (const lf of LONG_FORM) cortados.push(`${lf} [min=7]`);
    }

    // 3) Ajustes por flags (NV2/3)
    if (nivel >= 2) {
      // Curiosidade / dúvida → garantir modulação
      if (
        (flags.curiosidade || flags.duvida_classificacao) &&
        !gated.includes("MODULACAO_TOM_REGISTRO.txt")
      ) {
        gated.push("MODULACAO_TOM_REGISTRO.txt");
      }
      // Pedido prático → nenhum extra pesado; já cobrimos com modulação + mapas
    }

    // 4) Dedupe + ordem estável por prioridade
    const priorizado = ordenarPorPrioridade(gated);
    const posGating = Array.from(new Set(priorizado));

    return {
      nivel,
      intensidade,
      flags,
      raw,
      posGating,
      priorizado: posGating,
      cortados,
    };
  },
};

/* --------- Helpers --------- */

function ordenarPorPrioridade(arr: string[]): string[] {
  const priority = [
    // NV1 enxuto
    "NV1_CORE.txt",
    "IDENTIDADE_MINI.txt",
    "ANTISALDO_MIN.txt",
    // Core NV2/3
    "IDENTIDADE.txt",
    "MODULACAO_TOM_REGISTRO.txt",
    "ENCERRAMENTO_SENSIVEL.txt",
    // Mapas
    "ESCALA_ABERTURA_1a3.txt",
    "ESCALA_INTENSIDADE_0a10.txt",
    // Intervenções / técnico
    "METODO_VIVA_ENXUTO.txt",
    "BLOCO_TECNICO_MEMORIA.txt",
  ];
  const idx = new Map<string, number>();
  priority.forEach((n, i) => idx.set(n, i));

  const dedup = Array.from(new Set(arr));
  dedup.sort((a, b) => (idx.get(a) ?? 999) - (idx.get(b) ?? 999));
  return dedup;
}

export default Selector;
