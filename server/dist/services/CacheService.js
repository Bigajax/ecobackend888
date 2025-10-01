"use strict";
// server/services/CacheService.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLOCO_CACHE = exports.embeddingCache = exports.DERIVADOS_CACHE = exports.RESPONSE_CACHE = exports.PROMPT_CACHE = exports.TinyCache = void 0;
exports.invalidateResponseCacheForUser = invalidateResponseCacheForUser;
exports.clearResponseCache = clearResponseCache;
exports.rememberPrompt = rememberPrompt;
exports.invalidateDerivadosForUser = invalidateDerivadosForUser;
exports.recallPrompt = recallPrompt;
exports.invalidatePromptPrefix = invalidatePromptPrefix;
exports.buildCacheKey = buildCacheKey;
class TinyCache {
    store = new Map();
    opts;
    hits = 0;
    misses = 0;
    constructor(opts = {}) {
        this.opts = {
            maxItems: Math.max(50, opts.maxItems ?? 500),
            defaultTTLms: opts.defaultTTLms ?? 5 * 60_000,
            name: opts.name ?? "cache",
            enableStats: opts.enableStats ?? false,
        };
    }
    now() {
        return Date.now();
    }
    isExpired(e) {
        return !!e?.exp && this.now() >= e.exp;
    }
    touchLRU(key, e) {
        // Política LRU simples: remover e inserir novamente para ir ao fim.
        this.store.delete(key);
        this.store.set(key, e);
    }
    evictIfNeeded() {
        const overflow = this.store.size - this.opts.maxItems;
        if (overflow <= 0)
            return;
        // 1) remove expirados primeiro
        for (const [k, e] of this.store) {
            if (this.isExpired(e))
                this.store.delete(k);
            if (this.store.size <= this.opts.maxItems)
                return;
        }
        // 2) remove mais antigos (aproxima LRU pelo Map iteration order)
        const toRemove = overflow;
        let removed = 0;
        for (const k of this.store.keys()) {
            this.store.delete(k);
            removed++;
            if (removed >= toRemove)
                break;
        }
    }
    set(key, value, ttlMs) {
        if (typeof key !== "string" || !key)
            return;
        const now = this.now();
        const e = {
            v: value,
            at: now,
            exp: ttlMs === 0
                ? undefined
                : (ttlMs ?? this.opts.defaultTTLms) > 0
                    ? now + (ttlMs ?? this.opts.defaultTTLms)
                    : undefined,
        };
        this.store.set(key, e);
        this.touchLRU(key, e);
        this.evictIfNeeded();
    }
    get(key) {
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
    has(key) {
        const e = this.store.get(key);
        if (!e)
            return false;
        if (this.isExpired(e)) {
            this.store.delete(key);
            return false;
        }
        return true;
    }
    delete(key) {
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
    clearByPrefix(prefix) {
        if (!prefix)
            return;
        for (const k of this.store.keys()) {
            if (k.startsWith(prefix))
                this.store.delete(k);
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
            hitRate: this.hits + this.misses === 0
                ? 0
                : this.hits / (this.hits + this.misses),
        };
    }
}
exports.TinyCache = TinyCache;
/* ------------------------------------------------------------------ */
/*  INSTÂNCIAS COMPARTILHADAS                                          */
/* ------------------------------------------------------------------ */
/**
 * PROMPT_CACHE
 * - Usado pelo Orchestrator para cachear contextos (ex.: NV1 por userId+nivel+intensidade).
 * - TTL curto evita “engessar” tom; prefira 4–8 minutos.
 */
exports.PROMPT_CACHE = new TinyCache({
    name: "prompt",
    maxItems: 800,
    defaultTTLms: 6 * 60_000, // 6 min
});
/**
 * RESPONSE_CACHE (opcional)
 * - Pode ser usado para memorizar outputs curtos (fast-lane) por poucos minutos.
 */
exports.RESPONSE_CACHE = new TinyCache({
    name: "response",
    maxItems: 1000,
    defaultTTLms: 3 * 60_000, // 3 min
});
function invalidateResponseCacheForUser(userId) {
    if (!userId)
        return;
    exports.RESPONSE_CACHE.clearByPrefix(`resp:user:${userId}:`);
}
function clearResponseCache() {
    exports.RESPONSE_CACHE.clear();
}
exports.DERIVADOS_CACHE = new TinyCache({
    name: "derivados",
    maxItems: 600,
    defaultTTLms: 55 * 1000, // ~55s
});
/* ------------------------------------------------------------------ */
/*  HELPERS DE ALTO NÍVEL (conveniências)                              */
/* ------------------------------------------------------------------ */
function rememberPrompt(key, text, ttlMs) {
    exports.PROMPT_CACHE.set(key, text, ttlMs);
}
function invalidateDerivadosForUser(userId) {
    if (!userId)
        return;
    exports.DERIVADOS_CACHE.delete(`derivados:${userId}`);
}
function recallPrompt(key) {
    return exports.PROMPT_CACHE.get(key);
}
function invalidatePromptPrefix(prefix) {
    exports.PROMPT_CACHE.clearByPrefix(prefix);
}
/**
 * Ex.: buildCacheKey("ctx", userId, nivel, intensidade)
 */
function buildCacheKey(...parts) {
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
exports.embeddingCache = new Map();
/**
 * BLOCO_CACHE — compat com analisadores/bloco técnico.
 * Mantém TTL por TinyCache, mas se preferir Map “puro”, troque o tipo.
 */
exports.BLOCO_CACHE = new TinyCache({
    name: "bloco",
    maxItems: 1000,
    defaultTTLms: 10 * 60_000, // 10 min
});
//# sourceMappingURL=CacheService.js.map