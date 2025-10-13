// server/services/embeddingService.ts
import type OpenAI from "openai";

let _openai: OpenAI | null = null;
type OpenAIConstructor = new (config: {
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
}) => OpenAI;

let OpenAIClass: OpenAIConstructor | null = null;

function resolveOpenAIClass(): OpenAIConstructor {
  if (OpenAIClass) return OpenAIClass;

  let mod: any;
  try {
    mod = require("openai");
  } catch {
    throw new Error(
      "Pacote 'openai' não encontrado. Instale-o como dependência para gerar embeddings reais."
    );
  }

  const ctor = mod?.default ?? mod?.OpenAI ?? mod;
  if (typeof ctor !== "function") {
    throw new Error(
      "Pacote 'openai' encontrado, mas não exporta um construtor válido."
    );
  }

  OpenAIClass = ctor as OpenAIConstructor;
  return OpenAIClass;
}
const DEFAULT_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const DEFAULT_DIMENSION = DEFAULT_MODEL === "text-embedding-3-small" ? 1536 : 3072;
const MAX_CHARS = Number(process.env.EMBEDDING_MAX_CHARS || 8000); // simples proteção

const MAX_EMBEDDING_VECTOR_LENGTH = (() => {
  const parsed = Number(process.env.MAX_EMBEDDING_VECTOR_LENGTH);
  if (Number.isFinite(parsed) && parsed > 0) {
    const normalized = Math.floor(parsed);
    return Math.min(Math.max(normalized, 32), 65_536);
  }
  return 8_192;
})();

function normalizeDimension(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Math.min(Math.floor(fallback), MAX_EMBEDDING_VECTOR_LENGTH));
  }
  const normalized = Math.floor(parsed);
  if (normalized <= 0) {
    return Math.max(1, Math.min(Math.floor(fallback), MAX_EMBEDDING_VECTOR_LENGTH));
  }
  return Math.max(1, Math.min(normalized, MAX_EMBEDDING_VECTOR_LENGTH));
}

const EXPECTED_DIM = normalizeDimension(
  process.env.EMBEDDING_DIM ?? DEFAULT_DIMENSION,
  DEFAULT_DIMENSION
);

export { MAX_EMBEDDING_VECTOR_LENGTH };

function getOpenAI(): OpenAI {
  if (_openai) return _openai;

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.OPENAI_TOKEN ||
    "";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ausente. Defina OPENAI_API_KEY (ou OPENAI_KEY/OPENAI_TOKEN).");
  }
  const OpenAICtor = resolveOpenAIClass();
  _openai = new OpenAICtor({ apiKey, timeout: 20000, maxRetries: 2 });
  return _openai;
}

/** Normaliza vetor para norma-2 = 1 */
export function unitNorm(vec: number[] | Float32Array): number[] {
  const length = vec.length;
  if (!Number.isFinite(length) || length <= 0) {
    return [];
  }
  if (length > MAX_EMBEDDING_VECTOR_LENGTH) {
    throw new RangeError(
      `Embedding vector too large (${length} > ${MAX_EMBEDDING_VECTOR_LENGTH}).`
    );
  }

  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const value = Number(vec[i]);
    if (!Number.isFinite(value)) {
      throw new RangeError(`Embedding vector contém valor inválido na posição ${i}.`);
    }
    sum += value * value;
  }

  const norm = Math.sqrt(sum) || 1;
  const out = new Array<number>(length);
  for (let i = 0; i < length; i += 1) {
    const value = Number(vec[i]);
    out[i] = value / norm;
  }
  return out;
}

/** Embedding fake p/ dev sem API */
function fakeEmbedding(text: string, dim = EXPECTED_DIM || 256): number[] {
  const safeDim = normalizeDimension(dim, EXPECTED_DIM || 256);
  const te = new TextEncoder();
  const bytes = te.encode(text || "");
  const v = new Array<number>(safeDim).fill(0);
  for (let i = 0; i < bytes.length; i += 1) {
    v[i % safeDim] += (bytes[i] - 127) / 127;
  }
  return unitNorm(v);
}

/** Gera embedding para um texto completo (com validações simples) */
export async function embedTextoCompleto(texto: string, _tag?: string): Promise<number[]> {
  const t = (texto || "").trim().slice(0, MAX_CHARS);

  // Fallback dev
  if (process.env.ALLOW_FAKE_EMBEDDINGS === "true" && !process.env.OPENAI_API_KEY) {
    return fakeEmbedding(t);
  }

  const client = getOpenAI();
  const resp = await client.embeddings.create({ model: DEFAULT_MODEL, input: t });
  const emb = resp.data?.[0]?.embedding;

  if (!emb || !Array.isArray(emb)) {
    throw new Error("Falha ao obter embedding da API OpenAI.");
  }

  // (opcional) garantir dimensão esperada
  const vector = emb.slice(0, MAX_EMBEDDING_VECTOR_LENGTH);
  if (EXPECTED_DIM && vector.length !== EXPECTED_DIM) {
    if (vector.length > EXPECTED_DIM) {
      vector.length = EXPECTED_DIM;
    } else {
      while (vector.length < EXPECTED_DIM) vector.push(0);
    }
  }

  return vector as number[];
}
