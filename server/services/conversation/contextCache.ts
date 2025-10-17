import { createHash } from "node:crypto";

import { PROMPT_CACHE } from "../CacheService";
import { ContextBuilder } from "../promptContext";
import { derivarNivel, detectarSaudacaoBreve } from "../promptContext/Selector";
import type { EcoDecisionResult } from "./ecoDecisionHub";
import { isDebug, log } from "../promptContext/logger";
import type { ActivationTracer } from "../../core/activationTracer";

export interface ContextCacheParams {
  userId?: string;
  userName?: string;
  perfil?: any;
  mems?: any[];
  memoriasSemelhantes?: any[];
  contextFlags?: Record<string, unknown>;
  contextMeta?: Record<string, unknown>;
  forcarMetodoViva?: boolean;
  blocoTecnicoForcado?: any;
  texto: string;
  heuristicas?: any[];
  userEmbedding?: number[];
  skipSaudacao?: boolean;
  derivados?: any;
  aberturaHibrida?: any;
  decision?: EcoDecisionResult;
  activationTracer?: ActivationTracer;
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

    const memoryTagSignature = (() => {
      if (!Array.isArray(params.memoriasSemelhantes) || params.memoriasSemelhantes.length === 0)
        return "none";
      const tags: string[] = [];
      for (const memoria of params.memoriasSemelhantes) {
        if (tags.length >= 3) break;
        const rawTags = Array.isArray(memoria?.tags) ? memoria.tags : [];
        for (const raw of rawTags) {
          if (typeof raw !== "string") continue;
          const normalized = raw.trim().toLowerCase();
          if (!normalized) continue;
          tags.push(normalized);
          if (tags.length >= 3) break;
        }
      }
      if (!tags.length) return "vazio";
      const signature = tags.slice(0, 3).join("|");
      const hash = createHash("sha1").update(signature).digest("hex").slice(0, 6);
      return hash;
    })();

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
    )}:ms${msCount}:tg${memoryTagSignature}:v${vivaFlag}:d${derivadosFlag}:a${aberturaFlag}:h${heuristicasFlag}:e${embeddingFlag}`;

    const cachedBase = this.deps.cache.get(cacheKey);
    if (cachedBase && msCount === 0) {
      if (this.deps.debug()) {
        this.deps.logger.debug("[Orchestrator] contexto via cache", { cacheKey });
      }
      params.activationTracer?.addModule("__context_cache", "prompt_cache", "cached");
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
