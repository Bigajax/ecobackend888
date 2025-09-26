import crypto from "crypto";
import { embedTextoCompleto } from "./embeddingService"; // <- seu serviço existente
import { embeddingCache } from "../services/CacheService";

export function hashText(text: string): string {
  return crypto.createHash("md5").update((text || "").trim().toLowerCase()).digest("hex");
}

export async function getEmbeddingCached(text: string, tipo: string): Promise<number[]> {
  if (!text?.trim()) return [];
  const hash = hashText(text);
  const cached = embeddingCache.get(hash);
  if (cached) {
    console.log(`🎯 Cache hit para embedding (${tipo})`);
    return cached as number[];
  }
  const emb = await embedTextoCompleto(text, tipo);
  if (emb?.length) embeddingCache.set(hash, emb);
  return emb;
}
