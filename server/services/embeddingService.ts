// server/services/embeddingService.ts
import OpenAI from "openai";

/** Cache do client para evitar recriar */
let _openai: OpenAI | null = null;

/** Pega o client OpenAI em lazy-init. Lança erro se a key não estiver configurada. */
function getOpenAI(): OpenAI {
  if (_openai) return _openai;

  // tente múltiplas variáveis comuns
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.OPENAI_TOKEN ||
    "";

  if (!apiKey) {
    // Se quiser permitir fallback em dev, habilite ALLOW_FAKE_EMBEDDINGS=true
    if (process.env.ALLOW_FAKE_EMBEDDINGS === "true") {
      // Não criamos cliente — quem chamar embedTextoCompleto lidará com o fake
      return (_openai as any) as OpenAI; // apenas para satisfazer o tipo; não será usado
    }
    throw new Error(
      "OPENAI_API_KEY ausente. Defina OPENAI_API_KEY (ou OPENAI_KEY/OPENAI_TOKEN) nas variáveis de ambiente."
    );
  }

  _openai = new OpenAI({ apiKey });
  return _openai;
}

/** Normaliza vetor para norma-2 = 1 (evita NaN/divisão por zero) */
export function unitNorm(vec: number[] | Float32Array): number[] {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/** Fallback determinístico de “embedding” para dev/testes sem API key */
function fakeEmbedding(text: string, dim = 256): number[] {
  // hashing simples e estável por byte
  const te = new TextEncoder();
  const bytes = te.encode(text || "");
  const v = new Array(dim).fill(0);
  for (let i = 0; i < bytes.length; i++) {
    v[i % dim] += (bytes[i] - 127) / 127; // [-1,1] aprox
  }
  return unitNorm(v);
}

/**
 * Gera embedding para um texto completo.
 * @param texto Texto de entrada
 * @param _tag  (opcional) rótulo para logs/segmentação — ignorado pela API, mantido por compat
 * @returns Vetor de embedding (number[])
 */
export async function embedTextoCompleto(texto: string, _tag?: string): Promise<number[]> {
  // Fallback para dev/test
  if (process.env.ALLOW_FAKE_EMBEDDINGS === "true" && !process.env.OPENAI_API_KEY) {
    return fakeEmbedding(texto);
  }

  const client = getOpenAI();
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

  // A API do OpenAI aceita arrays de inputs; usamos um só
  // (Se quiser truncar, pode limitar tamanho do texto aqui)
  const resp = await client.embeddings.create({
    model,
    input: texto,
  });

  const emb = resp.data?.[0]?.embedding;
  if (!emb || !Array.isArray(emb)) {
    throw new Error("Falha ao obter embedding da API OpenAI.");
  }
  return emb as number[];
}
