const DIACRITICS_RE = /[\u0300-\u036f]/g;

const STOPWORDS_RAW = [
  "a",
  "à",
  "agora",
  "ai",
  "aí",
  "assim",
  "bem",
  "boa",
  "bom",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "ela",
  "ele",
  "essa",
  "este",
  "estou",
  "está",
  "estar",
  "isso",
  "já",
  "la",
  "lá",
  "lhe",
  "mais",
  "mas",
  "me",
  "mesma",
  "mesmo",
  "mim",
  "muito",
  "muita",
  "na",
  "no",
  "nos",
  "nossa",
  "nosso",
  "o",
  "oi",
  "olá",
  "ola",
  "opa",
  "para",
  "pra",
  "por",
  "porque",
  "que",
  "qual",
  "quais",
  "quer",
  "quero",
  "queria",
  "se",
  "sem",
  "ser",
  "sou",
  "só",
  "sua",
  "suas",
  "ta",
  "tá",
  "te",
  "tem",
  "tenho",
  "toda",
  "todo",
  "tudo",
  "uma",
  "umas",
  "uns",
  "voce",
  "você",
  "vocês",
  "vou"
];

export const STOPWORDS = new Set(STOPWORDS_RAW.map((word) => normalizeForMatch(word)));

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase();
}

interface TokenInfo {
  raw: string;
  normalized: string;
}

function tokenize(text: string): TokenInfo[] {
  return (text || "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((token) => ({ raw: token, normalized: normalizeForMatch(token) }));
}

export function extractMeaningfulTokens(text: string): TokenInfo[] {
  const meaningful: TokenInfo[] = [];
  const seen = new Set<string>();

  for (const token of tokenize(text)) {
    if (token.normalized.length < 4) continue;
    if (STOPWORDS.has(token.normalized)) continue;
    if (seen.has(token.normalized)) continue;
    meaningful.push(token);
    seen.add(token.normalized);
  }

  return meaningful;
}

export function extractKeywords(text: string, limit = 2): string[] {
  return extractMeaningfulTokens(text)
    .slice(0, limit)
    .map((token) => token.raw);
}

export function countMeaningfulWords(text: string): number {
  return extractMeaningfulTokens(text).length;
}

export function formatKeywordList(keywords: string[]): string {
  if (keywords.length === 0) return "";
  if (keywords.length === 1) return keywords[0];
  if (keywords.length === 2) return `${keywords[0]} e ${keywords[1]}`;
  const last = keywords[keywords.length - 1];
  return `${keywords.slice(0, -1).join(", ")} e ${last}`;
}

export function lowerFirst(text: string): string {
  if (!text) return text;
  return text[0].toLowerCase() + text.slice(1);
}

export function ensureTrailingQuestion(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[?!]$/.test(trimmed) ? trimmed : `${trimmed}?`;
}
