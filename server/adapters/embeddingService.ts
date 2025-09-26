// server/services/embeddingService.ts
import OpenAI from "openai";

let _openai: OpenAI | null = null;
const DEFAULT_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EXPECTED_DIM = Number(process.env.EMBEDDING_DIM || (DEFAULT_MODEL === "text-embedding-3-small" ? 1536 : 3072));
const MAX_CHARS = Number(process.env.EMBEDDING_MAX_CHARS || 8000); // simples proteção

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
  _openai = new OpenAI({ apiKey, timeout: 20000, maxRetries: 2 });
  return _openai;
}

/** Normaliza vetor para norma-2 = 1 */
export function unitNorm(vec: number[] | Float32Array): number[] {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/** Embedding fake p/ dev sem API */
function fakeEmbedding(text: string, dim = EXPECTED_DIM || 256): number[] {
  const te = new TextEncoder();
  const bytes = te.encode(text || "");
  const v = new Array(dim).fill(0);
  for (let i = 0; i < bytes.length; i++) v[i % dim] += (bytes[i] - 127) / 127;
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
  if (EXPECTED_DIM && emb.length !== EXPECTED_DIM) {
    // adapta (ou lança erro); aqui vou adaptar por segurança:
    if (emb.length > EXPECTED_DIM) emb.length = EXPECTED_DIM;
    else {
      const filled = emb.slice();
      while (filled.length < EXPECTED_DIM) filled.push(0);
      return filled;
    }
  }

  return emb as number[];
}
