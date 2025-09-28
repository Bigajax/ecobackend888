// server/services/CacheService.ts

import type { Derivados } from "./derivadosService";

/**
 * CacheService — cache em memória com TTL e política LRU simples.
 * - Chaves string estáveis (prefira prefixos por domínio: ex. "ctx:user:nv1").
 * - TTL por item (override) e TTL padrão no construtor.
 * - Limite por quantidade de itens com descarte FIFO/LRU simples.
 * - Helpers para limpeza por prefixo (evita repetição entre NV1 consecutivos).
 */

type Entry<V> = {
  v: V;
  at: number;        // created/updated timestamp
  exp?: number;      // expiresAt epoch ms (undefined = sem TTL)
};

export type TinyCacheOpts = {
  maxItems?: number;        // default: 500
  defaultTTLms?: number;    // default: 5 min
  name?: string;            // label p/ logs
  enableStats?: boolean;    // default: false
};

export class TinyCache<V = unknown> {
  private store = new Map<string, Entry<V>>();
  private opts: Required<TinyCacheOpts>;
  private hits = 0;
  private misses = 0;

  constructor(opts: TinyCacheOpts = {}) {
    this.opts = {
      maxItems: Math.max(50, opts.maxItems ?? 500),
      defaultTTLms: opts.defaultTTLms ?? 5 * 60_000,
      name: opts.name ?? "cache",
      enableStats: opts.enableStats ?? false,
    };
  }

  private now() {
    return Date.now();
  }

  private isExpired(e?: Entry<V>) {
    return !!e?.exp && this.now() >= e.exp!;
  }

  private touchLRU(key: string, e: Entry<V>) {
    // Política LRU simples: remover e inserir novamente para ir ao fim.
    this.store.delete(key);
    this.store.set(key, e);
  }

  private evictIfNeeded() {
    const overflow = this.store.size - this.opts.maxItems;
    if (overflow <= 0) return;

    // 1) remove expirados primeiro
    for (const [k, e] of this.store) {
      if (this.isExpired(e)) this.store.delete(k);
      if (this.store.size <= this.opts.maxItems) return;
    }

    // 2) remove mais antigos (aproxima LRU pelo Map iteration order)
    const toRemove = overflow;
    let removed = 0;
    for (const k of this.store.keys()) {
      this.store.delete(k);
      removed++;
      if (removed >= toRemove) break;
    }
  }

  set(key: string, value: V, ttlMs?: number) {
    if (typeof key !== "string" || !key) return;

    const now = this.now();
    const e: Entry<V> = {
      v: value,
      at: now,
      exp:
        ttlMs === 0
          ? undefined
          : (ttlMs ?? this.opts.defaultTTLms) > 0
          ? now + (ttlMs ?? this.opts.defaultTTLms)
          : undefined,
    };

    this.store.set(key, e);
    this.touchLRU(key, e);
    this.evictIfNeeded();
  }

  get(key: string): V | undefined {
    const e = this.store.get(key);
    if (!e) {
      this.misses++;
      return undefined;
    }
    if (this.isExpired(e)) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    // touch LRU
    this.touchLRU(key, e);
    return e.v;
  }

  has(key: string): boolean {
    const e = this.store.get(key);
    if (!e) return false;
    if (this.isExpired(e)) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Limpa todas as chaves que começam com o prefixo.
   * Útil p/ invalidar contextos NV1 quando houver mudança de identidade/princípios.
   */
  clearByPrefix(prefix: string) {
    if (!prefix) return;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  size() {
    return this.store.size;
  }

  keys() {
    return Array.from(this.store.keys());
  }

  stats() {
    return {
      name: this.opts.name,
      size: this.store.size,
      maxItems: this.opts.maxItems,
      defaultTTLms: this.opts.defaultTTLms,
      hits: this.hits,
      misses: this.misses,
      hitRate:
        this.hits + this.misses === 0
          ? 0
          : this.hits / (this.hits + this.misses),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  INSTÂNCIAS COMPARTILHADAS                                          */
/* ------------------------------------------------------------------ */

/**
 * PROMPT_CACHE
 * - Usado pelo Orchestrator para cachear contextos (ex.: NV1 por userId+nivel+intensidade).
 * - TTL curto evita “engessar” tom; prefira 4–8 minutos.
 */
export const PROMPT_CACHE = new TinyCache<string>({
  name: "prompt",
  maxItems: 800,
  defaultTTLms: 6 * 60_000, // 6 min
});

/**
 * RESPONSE_CACHE (opcional)
 * - Pode ser usado para memorizar outputs curtos (fast-lane) por poucos minutos.
 */
export const RESPONSE_CACHE = new TinyCache<string>({
  name: "response",
  maxItems: 1000,
  defaultTTLms: 3 * 60_000, // 3 min
});

export const DERIVADOS_CACHE = new TinyCache<Derivados>({
  name: "derivados",
  maxItems: 600,
  defaultTTLms: 55 * 1000, // ~55s
});

/* ------------------------------------------------------------------ */
/*  HELPERS DE ALTO NÍVEL (conveniências)                              */
/* ------------------------------------------------------------------ */

export function rememberPrompt(
  key: string,
  text: string,
  ttlMs?: number
): void {
  PROMPT_CACHE.set(key, text, ttlMs);
}

export function invalidateDerivadosForUser(userId?: string) {
  if (!userId) return;
  DERIVADOS_CACHE.delete(`derivados:${userId}`);
}

export function recallPrompt(key: string): string | undefined {
  return PROMPT_CACHE.get(key);
}

export function invalidatePromptPrefix(prefix: string): void {
  PROMPT_CACHE.clearByPrefix(prefix);
}

/**
 * Ex.: buildCacheKey("ctx", userId, nivel, intensidade)
 */
export function buildCacheKey(...parts: (string | number | null | undefined)[]) {
  return parts
    .map((p) => (p === null || p === undefined ? "_" : String(p)))
    .join(":");
}

/* ------------------------------------------------------------------ */
/*  COMPAT: exports esperados por outros módulos                       */
/* ------------------------------------------------------------------ */

/**
 * embeddingCache — compat com adapters que esperam um Map<string, number[]>
 * Usado p/ guardar embeddings já calculados (ex.: hashing de texto → vetor).
 */
export const embeddingCache = new Map<string, number[]>();

/**
 * BLOCO_CACHE — compat com analisadores/bloco técnico.
 * Mantém TTL por TinyCache, mas se preferir Map “puro”, troque o tipo.
 */
export const BLOCO_CACHE = new TinyCache<unknown>({
  name: "bloco",
  maxItems: 1000,
  defaultTTLms: 10 * 60_000, // 10 min
});
