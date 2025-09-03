// /assets/config/regulacaoTriggers.ts
// Gatilhos para práticas de regulação/respiração/grounding
// Saída indica quais módulos carregar quando as condições forem satisfeitas.

export type PraticaId = "GROUNDING" | "BOX" | "DISPENZA";

export type TriggerResult = {
  id: PraticaId;
  modulo: string;            // nome exato do arquivo em /assets/modulos
  score: number;             // 0–1 confiança heurística
  tags: string[];            // tags úteis para BLOCO TÉCNICO
  motivo: string;            // explicação curta para debug/log
};

export type TriggerInput = {
  texto: string;             // mensagem do usuário
  nivelAbertura?: number;    // 1–3 (seu modelo)
  intensidade?: number;      // 0–10 (estimada)
  tempoMinDisponivel?: number | null; // se você já extraiu isso em outro lugar
};

// Util: remover acentos e normalizar para comparação
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Tenta extrair "2 min", "3min", "5 minutos" -> número de minutos
export function extrairTempoMencionado(texto: string): number | null {
  const t = norm(texto);
  const m = t.match(/\b(\d{1,2})\s*(min|minuto|minutos)\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

const KW = {
  // estados/sinais que indicam necessidade de regulação
  ansiedade: [
    "ansioso", "ansiosa", "ansiedade", "inquieto", "inquieta", "inquietacao",
    "estresse", "estressado", "estressada", "sobrecarregado", "sobrecarregada",
    "acelerado", "acelerada", "mente acelerada", "ruminacao", "travar", "travado", "travada",
    "nao consigo focar", "sem foco", "perdi o foco", "muito tenso", "tensa", "tensao"
  ],
  // menções diretas às práticas
  grounding: ["grounding", "aterramento", "aterrar", "ficar presente"],
  box: ["box breathing", "respiracao em caixa", "4-4-4-4", "4 4 4 4"],
  dispenza: [
    "dispenza", "bencao dos centros", "bençao dos centros", "bencao dos centros de energia",
    "alinhamento dos centros", "centrar energia", "centros de energia"
  ],
};

// Heurísticas simples p/ pontuação
function includesAny(texto: string, termos: string[]): boolean {
  return termos.some(t => texto.includes(norm(t)));
}

function pontuarGrounding(t: TriggerInput): number {
  const tx = norm(t.texto);
  let s = 0;
  if (includesAny(tx, KW.ansiedade)) s += 0.6;
  if (includesAny(tx, KW.grounding)) s += 0.5;
  if ((t.nivelAbertura ?? 1) >= 2) s += 0.2;
  if ((t.intensidade ?? 0) >= 5) s += 0.2;
  return Math.min(1, s);
}

function pontuarBox(t: TriggerInput): number {
  const tx = norm(t.texto);
  let s = 0;
  if (includesAny(tx, ["nervoso", "nervosa", "sob pressao", "calmar", "acalmar", "antes da reuniao", "antes de decidir"])) s += 0.5;
  if (includesAny(tx, KW.box)) s += 0.5;
  const tempo = t.tempoMinDisponivel ?? extrairTempoMencionado(t.texto);
  if (tempo !== null && tempo <= 3) s += 0.3; // solução rápida
  if ((t.nivelAbertura ?? 1) >= 1) s += 0.1;
  return Math.min(1, s);
}

function pontuarDispenza(t: TriggerInput): number {
  const tx = norm(t.texto);
  let s = 0;
  if (includesAny(tx, KW.dispenza)) s += 0.8;
  if ((t.nivelAbertura ?? 1) >= 2) s += 0.1;
  const tempo = t.tempoMinDisponivel ?? extrairTempoMencionado(t.texto);
  if (tempo !== null && tempo >= 5) s += 0.1; // prática mais longa
  return Math.min(1, s);
}

/**
 * Detecta quais práticas de regulação sugerir e retorna módulos correspondentes.
 * Use um limiar simples (ex.: 0.6) ou ordene por score e pegue top-1/top-2.
 */
export function detectarPraticasRegulacao(input: TriggerInput, limiar = 0.6): TriggerResult[] {
  const resultados: TriggerResult[] = [];

  const sG = pontuarGrounding(input);
  if (sG >= limiar) {
    resultados.push({
      id: "GROUNDING",
      modulo: "ORIENTACAO_GROUNDING.txt",
      score: sG,
      tags: ["grounding", "regulacao_fisiologica", "respiracao_4-2-6"],
      motivo: "sinais de ansiedade/foco +/ou menção a grounding/aterramento",
    });
  }

  const sB = pontuarBox(input);
  if (sB >= limiar) {
    resultados.push({
      id: "BOX",
      modulo: "RESPIRACAO_GUIADA_BOX.txt",
      score: sB,
      tags: ["box_breathing", "respiracao_guiada"],
      motivo: "pedido de acalmar rápido, pressão/decisão ou menção a box breathing",
    });
  }

  const sD = pontuarDispenza(input);
  if (sD >= limiar) {
    resultados.push({
      id: "DISPENZA",
      modulo: "DR_DISPENZA_BENCAO_CENTROS_LITE.txt",
      score: sD,
      tags: ["dispenza_lite", "centragem_por_centros"],
      motivo: "menção explícita a Dispenza/centros com abertura/tempo",
    });
  }

  // Regra de desempate/tempo: se tempo <= 3min, priorizar BOX
  const tempo = input.tempoMinDisponivel ?? extrairTempoMencionado(input.texto);
  if (tempo !== null && tempo <= 3) {
    resultados.sort((a, b) => (a.id === "BOX" ? -1 : 1));
  } else {
    // caso geral: ordenar por maior score
    resultados.sort((a, b) => b.score - a.score);
  }

  return resultados;
}

// Sugestão utilitária para pegar apenas o melhor resultado
export function melhorPratica(input: TriggerInput, limiar = 0.6): TriggerResult | null {
  const r = detectarPraticasRegulacao(input, limiar);
  return r.length ? r[0] : null;
}
