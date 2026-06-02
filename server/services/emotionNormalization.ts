// services/emotionNormalization.ts
// Fonte única de verdade para normalização de emoção (taxonomia + rejeição de "neutro").
// Usado tanto pelo caminho legado (MemoryService) quanto pelo caminho de streaming/RPC
// (responseMetadata.buildStreamingMetaPayload), evitando divergência entre eles.

export const KNOWN_EMOTIONS: Record<string, string> = {
  // Basic emotions
  alegria: "Alegria",
  felicidade: "Alegria",
  feliz: "Alegria",
  contente: "Alegria",
  tristeza: "Tristeza",
  triste: "Tristeza",
  melancolia: "Tristeza",
  raiva: "Raiva",
  furioso: "Raiva",
  irritado: "Raiva",
  medo: "Medo",
  assustado: "Medo",
  nojo: "Nojo",
  desgosto: "Nojo",
  surpresa: "Surpresa",
  assombro: "Surpresa",
  calma: "Calma",
  tranquilo: "Calma",
  sereno: "Calma",

  // Additional emotions commonly found in messages
  ansiedade: "Ansiedade",
  ansioso: "Ansiedade",
  angustia: "Ansiedade",
  angustiado: "Ansiedade",
  preocupacao: "Ansiedade",
  preocupado: "Ansiedade",
  frustracao: "Frustração",
  frustrado: "Frustração",
  desespero: "Desespero",
  desesperado: "Desespero",
  vergonha: "Vergonha",
  envergonhado: "Vergonha",
  culpa: "Culpa",
  culpado: "Culpa",
  esperanca: "Esperança",
  esperancoso: "Esperança",
  alivio: "Alívio",
  aliviado: "Alívio",
  confusao: "Confusão",
  confuso: "Confusão",
  rejeicao: "Rejeição",
  rejeitado: "Rejeição",
  exclusao: "Rejeição",
  excluido: "Rejeição",
  solidao: "Solidão",
  solitario: "Solidão",
  vazio: "Vazio",
  dor: "Dor",
  dolorido: "Dor",
  compaixao: "Compaixão",
  amor: "Amor",
  amado: "Amor",
  gratidao: "Gratidão",
  grato: "Gratidão",
  ciumes: "Ciúmes",
  ciumento: "Ciúmes",

  // Meta-emotions for intensity-based fallback
  emocao_intensa: "Emoção Intensa",
  emocao_forte: "Emoção Intensa",
  intensa: "Emoção Intensa",
  forte: "Emoção Intensa",
};

export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    // Remove os acentos (combining marks) ANTES de trocar não-alfanuméricos por "_",
    // para que "frustração"/"solidão"/"angústia" casem com as chaves sem acento.
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
}

export function toTitleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Resolve a emoção principal para a taxonomia canônica.
 * Rejeita "neutro"/"neutra" (→ "Indefinida") e nunca retorna string vazia.
 */
export function resolveEmotion(primary: unknown, tags: string[] = []): string {
  // First, try to use the primary emotion if provided
  if (typeof primary === "string") {
    const trimmed = primary.trim();
    const normalized = normalizeToken(trimmed);

    // Reject "neutro"/"neutra" explicitly - they should become "Indefinida"
    if (normalized === "neutro" || normalized === "neutra") {
      return "Indefinida";
    }

    // If it matches a known emotion, return it in Title Case
    if (normalized && KNOWN_EMOTIONS[normalized]) {
      return KNOWN_EMOTIONS[normalized];
    }

    // For custom emotions: normalize to Title Case and validate
    if (normalized && normalized !== "indefinida") {
      // Extract first word for compound emotions (e.g., "medo de falhar" → "medo")
      const firstWord = trimmed.split(/\s+/)[0];
      const firstWordNormalized = normalizeToken(firstWord);

      // Check if first word is a known emotion
      if (firstWordNormalized && KNOWN_EMOTIONS[firstWordNormalized]) {
        return KNOWN_EMOTIONS[firstWordNormalized];
      }

      // Otherwise, return first word in Title Case (prevents long compound emotions)
      return toTitleCase(firstWord);
    }
  }

  // Try to find emotion in tags
  for (const tag of tags) {
    const key = normalizeToken(tag);
    if (key && KNOWN_EMOTIONS[key]) {
      return KNOWN_EMOTIONS[key];
    }
  }

  // Don't default to "Neutro" - use "Indefinida" instead to indicate unclear emotion
  // This prevents misleading "Neutro" labels for high-intensity emotional moments
  return "Indefinida";
}
