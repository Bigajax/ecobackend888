import {
  embedTextoCompleto,
  unitNorm,
  MAX_EMBEDDING_VECTOR_LENGTH,
} from "../adapters/embeddingService";

function coerceToNumberArray(value: unknown): number[] | null {
  let arr: unknown[] | null = null;

  if (Array.isArray(value)) {
    arr = value as unknown[];
  } else if (ArrayBuffer.isView(value) && typeof (value as any).length === "number") {
    arr = Array.from(value as unknown as ArrayLike<number>);
  } else {
    try {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) arr = parsed as unknown[];
    } catch {
      arr = null;
    }
  }

  if (!arr) return null;

  const nums = arr.map((x) => Number(x));
  if (nums.length < 2) return null;
  if (nums.length > MAX_EMBEDDING_VECTOR_LENGTH) return null;
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

export type PrepareQueryEmbeddingInput = {
  texto?: string;
  userEmbedding?: unknown;
  tag?: string;
};

export async function prepareQueryEmbedding(
  input: PrepareQueryEmbeddingInput
): Promise<number[] | null> {
  const { texto, userEmbedding, tag } = input;

  if (userEmbedding != null) {
    const coerced = coerceToNumberArray(userEmbedding);
    if (!coerced) return null;
    try {
      return unitNorm(coerced);
    } catch {
      return null;
    }
  }

  const normalizedTexto = texto?.trim();
  if (!normalizedTexto) return null;

  const raw = await embedTextoCompleto(normalizedTexto, tag);
  const coerced = coerceToNumberArray(raw);
  if (!coerced) return null;
  try {
    return unitNorm(coerced);
  } catch {
    return null;
  }
}

export { coerceToNumberArray };
