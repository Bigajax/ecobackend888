import { PROMPT_CACHE } from "../CacheService";
import { ContextBuilder } from "../promptContext";
import { derivarNivel, detectarSaudacaoBreve } from "../promptContext/Selector";
import { isDebug, log } from "../promptContext/logger";

export interface ContextCacheParams {
  userId?: string;
  userName?: string;
  perfil?: any;
  mems?: any[];
  memoriasSemelhantes?: any[];
  forcarMetodoViva?: boolean;
  blocoTecnicoForcado?: any;
  texto: string;
  heuristicas?: any[];
  userEmbedding?: number[];
  skipSaudacao?: boolean;
  derivados?: any;
  aberturaHibrida?: any;
}

interface ContextCacheDeps {
  cache: typeof PROMPT_CACHE;
  builder: typeof ContextBuilder;
  logger: typeof log;
  debug: typeof isDebug;
}

export class ContextCache {
  constructor(
    private readonly deps: ContextCacheDeps = {
      cache: PROMPT_CACHE,
      builder: ContextBuilder,
      logger: log,
      debug: isDebug,
    }
  ) {}

  async build(params: ContextCacheParams) {
    const entrada = String(params.texto ?? "");
    const saudacaoBreve = detectarSaudacaoBreve(entrada);
    const nivel = derivarNivel(entrada, saudacaoBreve);
    const intensidade = Math.max(
      0,
      ...(params.mems ?? []).map((m: any) => Number(m?.intensidade ?? 0))
    );

    const msCount = Array.isArray(params.memoriasSemelhantes)
      ? params.memoriasSemelhantes.length
      : 0;

    const cacheKey = `ctx:${params.userId || "anon"}:${nivel}:${Math.round(
      intensidade
    )}:ms${msCount}`;

    const cached = this.deps.cache.get(cacheKey);
    if (cached && msCount === 0) {
      if (this.deps.debug()) {
        this.deps.logger.debug("[Orchestrator] contexto via cache", { cacheKey });
      }
      return cached;
    }

    const t0 = Date.now();
    const contexto = await this.deps.builder.build(params as any);
    if (this.deps.debug()) {
      this.deps.logger.debug("[Orchestrator] contexto construído", {
        ms: Date.now() - t0,
      });
    }

    if (nivel <= 2 && msCount === 0) {
      this.deps.cache.set(cacheKey, contexto);
    }

    return contexto;
  }
}

export const defaultContextCache = new ContextCache();
