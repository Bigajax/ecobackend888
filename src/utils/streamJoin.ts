function findLastNonWhitespace(value: string): number {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    if (!/\s/u.test(value[i] ?? "")) {
      return i;
    }
  }
  return -1;
}

function findFirstNonWhitespace(value: string): number {
  for (let i = 0; i < value.length; i += 1) {
    if (!/\s/u.test(value[i] ?? "")) {
      return i;
    }
  }
  return -1;
}

function extractWordFromEnd(value: string, endIndex: number): string {
  if (endIndex < 0) return "";
  let start = endIndex;
  while (start > 0 && /\S/u.test(value[start - 1] ?? "")) {
    start -= 1;
  }
  return value.slice(start, endIndex + 1);
}

function extractWordFromStart(value: string, startIndex: number): string {
  if (startIndex < 0) return "";
  let end = startIndex;
  while (end + 1 < value.length && /\S/u.test(value[end + 1] ?? "")) {
    end += 1;
  }
  return value.slice(startIndex, end + 1);
}

export function smartJoin(accumulated: string, incoming: string): string {
  if (!accumulated) return incoming;
  if (!incoming) return accumulated;

  const lastNonWsIndex = findLastNonWhitespace(accumulated);
  const firstNonWsIndex = findFirstNonWhitespace(incoming);

  const hasWhitespaceBoundary =
    lastNonWsIndex < accumulated.length - 1 ||
    firstNonWsIndex > 0 ||
    lastNonWsIndex === -1 ||
    firstNonWsIndex === -1;

  if (hasWhitespaceBoundary) {
    return accumulated + incoming;
  }

  const lastWord = extractWordFromEnd(accumulated, lastNonWsIndex);
  const firstWord = extractWordFromStart(incoming, firstNonWsIndex);

  const lastChar = accumulated[lastNonWsIndex] ?? "";
  const firstChar = incoming[firstNonWsIndex] ?? "";

  const looksFragment =
    lastWord.length > 0 &&
    firstWord.length > 0 &&
    !/[.!?,;:]/u.test(lastChar) &&
    !/\n/u.test(lastChar) &&
    !/^[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛ]/u.test(firstChar);

  if (looksFragment) {
    return accumulated + incoming;
  }

  return `${accumulated} ${incoming}`;
}
