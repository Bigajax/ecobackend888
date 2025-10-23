export function smartJoin(accumulated: string, incoming: string): string {
  if (!accumulated) return incoming;
  if (!incoming) return accumulated;

  const accTrimmed = accumulated.trimEnd();
  const incTrimmed = incoming.trimStart();

  const lastWord = accTrimmed.split(/\s+/).pop() || "";
  const firstWord = incTrimmed.split(/\s+/)[0] || "";

  const isFragment =
    lastWord.length > 0 &&
    firstWord.length > 0 &&
    !/[.!?,;:]$/.test(lastWord) &&
    !/^[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛ]/.test(firstWord) &&
    !/\s$/.test(accumulated) &&
    !/^\s/.test(incoming);

  if (isFragment) {
    return accTrimmed + incoming;
  }

  const needsSpace =
    !/\s$/.test(accumulated) &&
    !/^\s/.test(incoming) &&
    !/[.!?,;:\n]$/.test(accTrimmed);

  return needsSpace ? `${accTrimmed} ${incTrimmed}` : accumulated + incoming;
}
