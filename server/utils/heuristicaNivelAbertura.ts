export function heuristicaNivelAbertura(texto: string): number {
  /**
   * Heurística simples para determinar o nível de abertura emocional
   * 1 = superficial   | frases curtas, saudações ou agradecimentos
   * 2 = médio         | relato factual ou neutro, sem exposição forte
   * 3 = profundo      | presença de verbos sentir, dor, amor, raiva etc.
   */
  const superficial = /(obrigado|valeu|ol[áa]|bom\s*d[ia]|boa\s*tarde|boa\s*noite)/i;
  const profundo = /(sinto|senti|não\s*aguento|vazio|perdido|exaust[ãa]o?|exaurid[oa]|feliz\s*demais|triste(za)?|raiva|ang[úu]stia|culpa|medo)/i;

  if (profundo.test(texto)) return 3;
  if (superficial.test(texto)) return 1;
  return 2; // default médio
}