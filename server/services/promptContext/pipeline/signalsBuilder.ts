import type { HeuristicaFlagRecord } from "../heuristicaFlags";
import type { SimilarMemory } from "../contextTypes";
import type { HeuristicsRuntime } from "../heuristicsV2";
import { estimateMemoryTokens } from "../helpers/memoryHelpers";
import { normalizeForSignals } from "../helpers/validationHelpers";

export type DecisionSignalMap = Record<string, boolean>;

export const heuristicaSignalPatterns: Record<string, Array<string | RegExp>> = {
  "bias:ancoragem": [
    "antes era melhor",
    "voltar como antes",
    "no passado",
    "naquela epoca",
    /quando eu era/i,
    /desde que (?:tudo|isso) aconteceu/i,
  ],
  "bias:causas_superam_estatisticas": [
    "conheco um caso",
    "aconteceu com meu",
    "um amigo passou",
    "caso real prova",
    /mesmo que as? estatistic[ao]s?/i,
  ],
  "bias:certeza_emocional": [
    "sinto que e verdade",
    "no fundo eu sei",
    "meu coracao diz",
    "sensacao de certeza",
  ],
  "bias:disponibilidade": [
    "nao paro de ver",
    "toda hora vejo",
    "ultimamente so vejo",
    "vi nas noticias",
    "aconteceu ontem de novo",
  ],
  "bias:excesso_confianca": [
    "tenho certeza absoluta",
    "impossivel dar errado",
    "nunca falho",
    "vai dar certo sim",
    "sou muito bom nisso",
  ],
  "bias:ilusao_compreensao": [
    "eu sabia que",
    "sempre soube",
    "ficou obvio depois",
    "era claro desde o inicio",
  ],
  "bias:ilusao_validade": [
    "parece certo",
    "parece verdade",
    "minha intuicao diz",
    "sigo meu feeling",
  ],
  "bias:intuicao_especialista": [
    "anos na area",
    "minha experiencia mostra",
    "ja vi isso mil vezes",
    "confie em mim eu sei",
  ],
  "bias:regressao_media": [
    "foi muita sorte",
    "foi puro azar",
    "sempre acontece assim",
    "bate recorde toda vez",
    "logo volta ao normal",
  ],
};

export const heuristicaFlagToSignal: Record<string, string> = {
  ancoragem: "bias:ancoragem",
  causas_superam_estatisticas: "bias:causas_superam_estatisticas",
  certeza_emocional: "bias:certeza_emocional",
  excesso_intuicao_especialista: "bias:intuicao_especialista",
  ignora_regressao_media: "bias:regressao_media",
};

const racionalKeywords = [
  "analise racional",
  "pensar com calma",
  "olhar racional",
  "quero algo objetivo",
  "presenca racional",
  "perspectiva logica",
  "menos emocional",
];

function matchesPattern(pattern: string | RegExp, normalized: string, raw: string): boolean {
  if (typeof pattern === "string") {
    return normalized.includes(pattern);
  }
  pattern.lastIndex = 0;
  return pattern.test(raw);
}

export function hasRationalCue(normalized: string, raw: string): boolean {
  if (racionalKeywords.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  return /\bracional\b/i.test(raw) || /\blogic[ao]\b/i.test(raw);
}

export function buildDecisionSignals(
  params: {
    texto: string;
    heuristicaFlags: HeuristicaFlagRecord;
    intensity: number;
    memsSemelhantes: SimilarMemory[] | undefined;
  },
  heuristicsRuntime?: HeuristicsRuntime | null
): DecisionSignalMap {
  const raw = typeof params.texto === "string" ? params.texto : "";
  const normalized = normalizeForSignals(raw);
  const signals: DecisionSignalMap = {};

  if (heuristicsRuntime) {
    for (const [signal, detail] of Object.entries(heuristicsRuntime.details ?? {})) {
      if (detail?.passesDefault) {
        signals[signal] = true;
      }
    }
  } else {
    for (const [signal, patterns] of Object.entries(heuristicaSignalPatterns)) {
      if (patterns.some((pattern) => matchesPattern(pattern, normalized, raw))) {
        signals[signal] = true;
      }
    }

    for (const [flag, signal] of Object.entries(heuristicaFlagToSignal)) {
      if ((params.heuristicaFlags as Record<string, boolean | undefined>)[flag]) {
        signals[signal] = true;
      }
    }
  }

  if (params.intensity >= 7) {
    signals["intensity:alta"] = true;
  }

  const memoriaTokens = estimateMemoryTokens(params.memsSemelhantes);
  if (memoriaTokens >= 220) {
    signals["memoria:alta"] = true;
  }

  if (hasRationalCue(normalized, raw)) {
    signals.presenca_racional = true;
  }

  return signals;
}
