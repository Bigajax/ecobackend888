// caches (prompt, bloco, embeddings) + limpeza periódica
declare const require: any;
let NodeCacheLib: any;
try { NodeCacheLib = require("node-cache"); }
catch {
  class SimpleCache {
    private map = new Map<string, { v: any; exp: number }>();
    constructor(private opts: { stdTTL?: number; maxKeys?: number } = {}) {}
    get<T=any>(k:string){ const e=this.map.get(k); if(!e) return; if(e.exp&&Date.now()>e.exp){this.map.delete(k); return;} return e.v as T;}
    set<T=any>(k:string,v:T){ if(this.opts.maxKeys&&this.map.size>=this.opts.maxKeys){const f=this.map.keys().next().value; if(f) this.map.delete(f);} const exp=this.opts.stdTTL?Date.now()+this.opts.stdTTL*1000:0; this.map.set(k,{v,exp}); return true;}
    clear(){ this.map.clear(); }
    get size(){ return this.map.size; }
  }
  NodeCacheLib = SimpleCache;
}

export const embeddingCache = new NodeCacheLib({ stdTTL: 3600, maxKeys: 1000 });
export const PROMPT_CACHE = new Map<string, string>();
export const BLOCO_CACHE  = new Map<string, any>();

// limpeza opcional (evite em serverless)
if (!process.env.SERVERLESS) {
  setInterval(() => {
    const before = PROMPT_CACHE.size + BLOCO_CACHE.size;
    if (PROMPT_CACHE.size > 100) PROMPT_CACHE.clear();
    if (BLOCO_CACHE.size > 200) BLOCO_CACHE.clear();
    const after = PROMPT_CACHE.size + BLOCO_CACHE.size;
    if (before !== after) console.log(`🧹 Cache limpo: ${before} → ${after}`);
  }, 30 * 60 * 1000);
}
