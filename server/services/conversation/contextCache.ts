import { PROMPT_CACHE } from "../CacheService";
import { ContextBuilder } from "../promptContext";
import { derivarNivel, detectarSaudacaoBreve } from "../promptContext/Selector";
import type { EcoDecisionResult } from "./ecoDecisionHub";
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
  decision?: EcoDecisionResult;
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
    const decision = params.decision;
    const nivel = decision?.openness ?? derivarNivel(entrada, saudacaoBreve);
    const intensidade = decision?.intensity ?? 0;

    const msCount = Array.isArray(params.memoriasSemelhantes)
      ? params.memoriasSemelhantes.length
      : 0;

    const vivaFlag = decision?.vivaSteps?.length ? "1" : params.forcarMetodoViva ? "1" : "0";
    const derivadosFlag = params.derivados ? "1" : "0";
    const aberturaFlag = params.aberturaHibrida ? "1" : "0";
    const heuristicasFlag = Array.isArray(params.heuristicas)
      ? params.heuristicas.length > 0
        ? "1"
        : "0"
      : params.heuristicas
      ? "1"
      : "0";
    const embeddingFlag = Array.isArray(params.userEmbedding)
      ? params.userEmbedding.length > 0
        ? "1"
        : "0"
      : params.userEmbedding
      ? "1"
      : "0";

    const cacheKey = `ctx:${params.userId || "anon"}:${nivel}:${Math.round(
      intensidade
    )}:ms${msCount}:v${vivaFlag}:d${derivadosFlag}:a${aberturaFlag}:h${heuristicasFlag}:e${embeddingFlag}`;

    const cachedBase = this.deps.cache.get(cacheKey);
    if (cachedBase && msCount === 0) {
      if (this.deps.debug()) {
        this.deps.logger.debug("[Orchestrator] contexto via cache", { cacheKey });
      }
      return this.deps.builder.montarMensagemAtual(cachedBase, entrada);
    }

    const t0 = Date.now();
    const contexto = await this.deps.builder.build(params as any);
    const prompt = contexto.montarMensagemAtual(entrada);
    if (this.deps.debug()) {
      this.deps.logger.debug("[Orchestrator] contexto construído", {
        ms: Date.now() - t0,
      });
    }

    if (nivel <= 2 && msCount === 0) {
      this.deps.cache.set(cacheKey, contexto.base);
    }

    return prompt;
  }
}

export const defaultContextCache = new ContextCache();
