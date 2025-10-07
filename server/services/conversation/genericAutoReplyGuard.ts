import {
  countMeaningfulWords,
  normalizeForMatch,
} from "./textUtils";

interface GenericPhraseRule {
  label: string;
  phrase: string;
  weight: number;
}

interface GenericPatternRule {
  label: string;
  regex: RegExp;
  weight: number;
}

const GENERIC_PATTERNS: GenericPatternRule[] = [
  {
    label: "como_posso_ajudar",
    regex: /^(?:oi+|ola+|ol[aá]|oie+|opa+|hey+|hello+|ei+|e\s*a[eií]?|fala+|bom\s+dia|boa\s+(?:tarde|noite)|tudo\s+bem|salve)?[\s,!.-]*como\s+posso\s+ajudar/,
    weight: 4,
  },
  {
    label: "em_que_posso_ajudar",
    regex: /^(?:oi+|ola+|ol[aá]|oie+|opa+|hey+|hello+|ei+|e\s*a[eií]?|fala+|bom\s+dia|boa\s+(?:tarde|noite)|tudo\s+bem|salve)?[\s,!.-]*em\s+que\s+posso\s+ajudar/,
    weight: 4,
  },
  {
    label: "posso_ser_util",
    regex: /^(?:oi+|ola+|ol[aá]|oie+|opa+|hey+|hello+|ei+|fala+)?[\s,!.-]*(?:posso\s+(?:ser\s+)?utile?|posso\s+fazer\s+por\s+voce)/,
    weight: 3,
  },
  {
    label: "estou_aqui_para_ajudar",
    regex: /^(?:oi+|ola+|ol[aá]|oie+|opa+|hey+|hello+|ei+|fala+)?[\s,!.-]*estou\s+aqui\s+para\s+ajudar/,
    weight: 3,
  },
];

const GENERIC_PHRASES: GenericPhraseRule[] = [
  { label: "quer_me_contar_um_pouco", phrase: "quer me contar um pouco mais", weight: 3 },
  { label: "me_conta_um_pouco", phrase: "me conta um pouco mais", weight: 3 },
  { label: "to_aqui_com_voce", phrase: "to aqui com voce", weight: 3 },
  { label: "estou_aqui_com_voce", phrase: "estou aqui com voce", weight: 3 },
  { label: "conte_comigo", phrase: "conte comigo", weight: 2 },
];

const GENERIC_SINGLE_WORD = /^(?:oi+|ola+|ol[aá]|oie+|opa+|hey+|hello+|eai+|ea[eí]|fala+)[\s,!.-]*$/;

export interface GenericAutoReplyAnalysis {
  isGeneric: boolean;
  score: number;
  matches: string[];
  wordCount: number;
  meaningfulCount: number;
}

export function detectGenericAutoReply(text: string): GenericAutoReplyAnalysis {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return {
      isGeneric: true,
      score: 10,
      matches: ["empty"],
      wordCount: 0,
      meaningfulCount: 0,
    };
  }

  const normalized = normalizeForMatch(trimmed);
  const matches: string[] = [];
  let score = 0;

  if (GENERIC_SINGLE_WORD.test(normalized)) {
    matches.push("single_word_greeting");
    score += 4;
  }

  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      matches.push(pattern.label);
      score += pattern.weight;
    }
  }

  for (const phrase of GENERIC_PHRASES) {
    const idx = normalized.indexOf(phrase.phrase);
    if (idx >= 0 && idx <= 60) {
      matches.push(phrase.label);
      score += phrase.weight;
    }
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const meaningfulCount = countMeaningfulWords(trimmed);

  if (wordCount <= 6) score += 1;
  if (meaningfulCount <= 2) score += 1;
  if (!/[.!?]/.test(trimmed) && wordCount <= 8) score += 1;

  const uniqueWords = new Set(normalized.split(/\s+/).filter(Boolean));
  if (uniqueWords.size <= Math.max(2, Math.ceil(wordCount / 2))) {
    score += 1;
  }

  const isGeneric = matches.length > 0 || score >= 5;

  return { isGeneric, score, matches, wordCount, meaningfulCount };
}
