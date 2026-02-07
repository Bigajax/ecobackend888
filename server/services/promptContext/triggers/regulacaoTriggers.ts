// services/promptContext/triggers/regulacaoTriggers.ts
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

// Util: remover acentos, normalizar espaços e caixa
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Tenta extrair tempo: "2 min", "3min", "5 minutos", "2m", "2'", "2 min."
export function extrairTempoMencionado(texto: string): number | null {
  const t = norm(texto);
  const m = t.match(/\b(\d{1,2})\s*(?:m|min|min\.|minuto|minutos|['’])\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

const KW = {
  // estados/sinais que indicam necessidade de regulação
  ansiedade: [
    "ansioso", "ansiosa", "ansiedade",
    "inquieto", "inquieta", "inquietacao",
    "estresse", "estressado", "estressada",
    "sobrecarregado", "sobrecarregada", "nao estou dando conta",
    "acelerado", "acelerada", "mente acelerada",
    "ruminacao", "pensando sem parar",
    "travar", "travado", "travada",
    "nao consigo focar", "sem foco", "perdi o foco",
    "muito tenso", "tensa", "tensao",
    "falta de ar", "aperto no peito", "no na garganta",
    "taquicardia", "suor frio", "nausea"
  ],
  // menções diretas às práticas
  grounding: [
    "grounding", "aterramento", "aterrar", "ficar presente",
    "voltar para o corpo", "notar os pes", "sentir os pes", "ancorar no agora"
  ],
  box: [
    "box breathing", "respiracao em caixa", "4-4-4-4", "4 4 4 4",
    "respirar em quatro tempos", "respirar em caixa"
  ],
  dispenza: [
    "dispenza", "bencao dos centros", "bencao dos centros de energia",
    "alinhamento dos centros", "centrar energia", "centros de energia"
  ],
  pressaoCurta: [
    "antes da reuniao", "vou entrar na reuniao", "preciso decidir agora",
    "tenho pouco tempo", "to sem tempo", "rapidinho"
  ]
};

// Heurísticas simples p/ pontuação (texto já normalizado)
function includesAny(texto: string, termos: string[]): boolean {
  const tx = norm(texto);
  return termos.some(t => tx.includes(t));
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function pontuarGrounding(t: TriggerInput): number {
  const tx = norm(t.texto);
  const intensidade = t.intensidade ?? 0;
  const nivel = t.nivelAbertura ?? 1;
  let s = 0;

  // Sinais de ansiedade / corpo
  if (includesAny(tx, KW.ansiedade)) s += 0.5;
  if (includesAny(tx, KW.grounding)) s += 0.4;

  // Intensidade pesa bastante (seguro e universal)
  if (intensidade >= 8) s += 0.4;
  else if (intensidade >= 7) s += 0.25;
  else if (intensidade >= 5) s += 0.15;

  // Abertura ajuda, mas pouco (grounding cabe em todos)
  if (nivel >= 2) s += 0.1;

  return clamp01(s);
}

function pontuarBox(t: TriggerInput): number {
  const tx = norm(t.texto);
  const intensidade = t.intensidade ?? 0;
  const nivel = t.nivelAbertura ?? 1;
  const tempo = t.tempoMinDisponivel ?? extrairTempoMencionado(t.texto);

  let s = 0;

  // Situação de pressão curta / menção explícita
  if (includesAny(tx, KW.box)) s += 0.5;
  if (includesAny(tx, KW.pressaoCurta)) s += 0.35;

  // Intensidade média/alta se beneficia de técnica breve
  if (intensidade >= 6) s += 0.15;

  // Tempo curto favorece Box
  if (tempo !== null && tempo <= 3) s += 0.3;

  // Qualquer nível de abertura serve
  if (nivel >= 1) s += 0.05;

  return clamp01(s);
}

function pontuarDispenza(t: TriggerInput): number {
  const tx = norm(t.texto);
  const intensidade = t.intensidade ?? 0;
  const nivel = t.nivelAbertura ?? 1;
  const tempo = t.tempoMinDisponivel ?? extrairTempoMencionado(t.texto);

  let s = 0;

  // Menção explícita pesa muito
  if (includesAny(tx, KW.dispenza)) s += 0.8;

  // Requer abertura e um pouco mais de tempo
  if (nivel >= 2) s += 0.1;
  if (tempo !== null && tempo >= 5) s += 0.1;

  // Em intensidades muito altas, priorizamos grounding (ver ordenação)
  if (intensidade >= 8) s -= 0.1; // leve ajuste: evita sobrepor grounding em crise

  return clamp01(s);
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
      tags: ["grounding", "regulacao_fisiologica", "ancoragem_no_corpo"],
      motivo: "sinais de ansiedade/alta intensidade ou menção a grounding/aterramento"
    });
  }

  const sB = pontuarBox(input);
  if (sB >= limiar) {
    resultados.push({
      id: "BOX",
      modulo: "RESPIRACAO_GUIADA_BOX.txt",
      score: sB,
      tags: ["box_breathing", "respiracao_guiada", "regulacao_breve"],
      motivo: "pressao/tempo curto ou menção a respiracao em caixa"
    });
  }

  const sD = pontuarDispenza(input);
  if (sD >= limiar) {
    resultados.push({
      id: "DISPENZA",
      modulo: "DR_DISPENZA_BENCAO_CENTROS_LITE.txt",
      score: sD,
      tags: ["dispenza_lite", "centragem_por_centros"],
      motivo: "menção direta a Dispenza/centros com abertura/tempo suficiente"
    });
  }

  // Ordenação inteligente:
  // 1) crise (intensidade >= 8): grounding primeiro
  // 2) tempo curto (<=3min): box primeiro
  // 3) caso geral: maior score
  const tempo = input.tempoMinDisponivel ?? extrairTempoMencionado(input.texto);
  const intensidade = input.intensidade ?? 0;

  if (intensidade >= 8) {
    resultados.sort((a, b) => (a.id === "GROUNDING" ? -1 : b.id === "GROUNDING" ? 1 : b.score - a.score));
  } else if (tempo !== null && tempo <= 3) {
    resultados.sort((a, b) => (a.id === "BOX" ? -1 : b.id === "BOX" ? 1 : b.score - a.score));
  } else {
    resultados.sort((a, b) => b.score - a.score);
  }

  return resultados;
}

// Sugestão utilitária para pegar apenas o melhor resultado
export function melhorPratica(input: TriggerInput, limiar = 0.6): TriggerResult | null {
  const r = detectarPraticasRegulacao(input, limiar);
  return r.length ? r[0] : null;
}
