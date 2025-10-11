import crypto from "node:crypto";

import type { EcoLatencyMarks } from "../../services/ConversationOrchestrator";
import { buildFinalizedStreamText } from "../../services/conversation/responseMetadata";
import { RESPONSE_CACHE } from "../../services/CacheService";
import { log } from "../../services/promptContext/logger";
import type { GetEcoResult } from "../../utils";

export const CACHE_TTL_MS = 60_000;

export type CachedResponsePayload = {
  raw: string;
  meta?: Record<string, any> | null;
  modelo?: string | null;
  usage?: unknown;
  timings?: EcoLatencyMarks;
};

export const buildResponseCacheKey = (userId: string, ultimaMsg: string) => {
  const hash = crypto.createHash("sha1").update(`${userId}:${ultimaMsg}`).digest("hex");
  return `resp:user:${userId}:${hash}`;
};

export const getCachedResponsePayload = (
  cacheKey: string | null
): CachedResponsePayload | null => {
  if (!cacheKey) return null;
  const cachedRaw = RESPONSE_CACHE.get(cacheKey);
  if (!cachedRaw) return null;

  try {
    return JSON.parse(cachedRaw) as CachedResponsePayload;
  } catch (error) {
    log.warn("⚠️ Falha ao parsear RESPONSE_CACHE:", {
      cacheKey,
      error: (error as Error)?.message,
    });
    RESPONSE_CACHE.delete(cacheKey);
    return null;
  }
};

export const normalizeCachedResponse = (
  cacheKey: string | null,
  cachedPayload: CachedResponsePayload
): CachedResponsePayload => {
  if (!cachedPayload.raw || cachedPayload.raw.includes("```json")) {
    return cachedPayload;
  }

  const metaSource =
    cachedPayload.meta && typeof cachedPayload.meta === "object"
      ? cachedPayload.meta
      : {};
  const normalizedResult: GetEcoResult = { message: cachedPayload.raw };

  if (typeof (metaSource as any).intensidade === "number") {
    normalizedResult.intensidade = (metaSource as any).intensidade;
  }
  if (typeof (metaSource as any).resumo === "string" && (metaSource as any).resumo.trim()) {
    normalizedResult.resumo = (metaSource as any).resumo;
  }
  if (typeof (metaSource as any).emocao === "string" && (metaSource as any).emocao.trim()) {
    normalizedResult.emocao = (metaSource as any).emocao;
  }
  if (Array.isArray((metaSource as any).tags)) {
    normalizedResult.tags = (metaSource as any).tags.filter(
      (tag: unknown): tag is string => typeof tag === "string"
    );
  }
  if (typeof (metaSource as any).categoria === "string" || (metaSource as any).categoria === null) {
    normalizedResult.categoria = (metaSource as any).categoria ?? null;
  }
  if ((metaSource as any).proactive !== undefined) {
    normalizedResult.proactive =
      typeof (metaSource as any).proactive === "object" || (metaSource as any).proactive === null
        ? ((metaSource as any).proactive as GetEcoResult["proactive"])
        : null;
  }

  const rebuiltRaw = buildFinalizedStreamText(normalizedResult);
  let normalizedMeta: Record<string, any> | null =
    cachedPayload.meta && typeof cachedPayload.meta === "object"
      ? { ...cachedPayload.meta }
      : null;
  if (normalizedMeta) normalizedMeta.length = rebuiltRaw.length;
  else normalizedMeta = { length: rebuiltRaw.length };

  const updatedPayload: CachedResponsePayload = {
    ...cachedPayload,
    raw: rebuiltRaw,
    meta: normalizedMeta,
  };

  if (cacheKey) {
    try {
      RESPONSE_CACHE.set(cacheKey, JSON.stringify(updatedPayload), CACHE_TTL_MS);
    } catch (error) {
      log.warn("⚠️ Falha ao atualizar RESPONSE_CACHE legado:", {
        cacheKey,
        error: (error as Error)?.message,
      });
    }
  }

  return updatedPayload;
};

export const storeResponseInCache = (cacheKey: string, payload: CachedResponsePayload) => {
  try {
    RESPONSE_CACHE.set(cacheKey, JSON.stringify(payload), CACHE_TTL_MS);
  } catch (error) {
    log.warn("⚠️ Falha ao salvar RESPONSE_CACHE:", (error as Error)?.message);
  }
};
