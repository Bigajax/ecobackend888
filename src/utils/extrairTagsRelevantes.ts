export const extrairTagsRelevantes = (texto: string): string[] => {
  const mapa: Record<string, string[]> = {
    alegria: ['feliz', 'alegre', 'contente', 'grato', 'sorrindo', 'leve'],
    tristeza: ['triste', 'chorar', 'abatido', 'desânimo'],
    medo: ['medo', 'receio', 'inseguro'],
    ansiedade: ['ansioso', 'tenso', 'afobado'],
    raiva: ['raiva', 'ódio', 'irritado'],
    culpa: ['culpa', 'remorso'],
    vazio: ['vazio', 'sem sentido'],
    confusao: ['confuso', 'perdido', 'incerto'],
    gratidão: ['gratidão', 'agradecido', 'obrigado'],
  };

  const low = texto.toLowerCase();
  const tags = new Set<string>();

  Object.entries(mapa).forEach(([tag, palavras]) => {
    if (palavras.some((p) => low.includes(p))) tags.add(tag);
  });

  return [...tags];
};
