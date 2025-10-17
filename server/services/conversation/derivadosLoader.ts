// server/services/conversation/derivadosLoader.ts
import { sleep } from "../../utils";
import { DERIVADOS_CACHE } from "../CacheService";
import {
  getDerivados,
  insightAbertura,
  type Derivados,
} from "../derivadosService";
import {
  defaultParallelFetchService,
  withTimeoutOrNull,
} from "./parallelFetch";
import { log as defaultLogger } from "../promptContext/logger";
import type { RetrieveMode } from "../supabase/memoriaRepository";
import { decideContinuity } from "./continuity";
import type { ActivationTracer } from "../../core/activationTracer";

export interface ConversationContextResult {
  heuristicas: any[];
  userEmbedding: number[];
  memsSemelhantes: any[];
  derivados: Derivados | null;
  aberturaHibrida: any | null; // pode variar conforme implementação de insightAbertura
  flags: Record<string, unknown>;
  meta: Record<string, unknown>;
  continuity?: {
    hasContinuity: boolean;
    similarity: number | null;
    diasDesde: number | null;
    memoryRef: Record<string, unknown> | null;
  };
}

interface CacheLike<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

interface ParallelFetchLike {
  run(params: {
    ultimaMsg: string;
    userId?: string;
    supabase?: any;
    retrieveMode?: RetrieveMode;
  }): Promise<{
    heuristicas: any[];
    userEmbedding: number[];
    memsSemelhantes: any[];
  }>;
}

export interface LoadConversationContextOptions {
  promptOverride?: string;
  metaFromBuilder?: any;
  // Logger mínimo exigido: apenas warn; usamos optional chaining ao invocar
  logger?: { warn?: (msg: string) => void; info?: (...args: any[]) => void } | undefined;
  parallelFetchService?: ParallelFetchLike;
  cache?: CacheLike<Derivados>;
  getDerivadosFn?: typeof getDerivados;
  insightAberturaFn?: typeof insightAbertura;
  withTimeoutOrNullFn?: typeof withTimeoutOrNull;
  sleepFn?: typeof sleep;
  derivadosTimeoutMs?: number;
  paralelasTimeoutMs?: number;
  onDerivadosError?: (error: unknown) => void;
  activationTracer?: ActivationTracer;
  retrieveMode?: RetrieveMode;
}

export const DEFAULT_DERIVADOS_TIMEOUT_MS = Number(
  process.env.ECO_DERIVADOS_TIMEOUT_MS ?? 600
);
export const DEFAULT_PARALELAS_TIMEOUT_MS = Number(
  process.env.ECO_PARALELAS_TIMEOUT_MS ?? 900
);

const EMPTY_PARALLEL_RESULT = {
  heuristicas: [] as any[],
  userEmbedding: [] as number[],
  memsSemelhantes: [] as any[],
};

export async function loadConversationContext(
  userId: string | undefined,
  ultimaMsg: string,
  supabase: any,
  options: LoadConversationContextOptions = {}
): Promise<ConversationContextResult> {
  const {
    promptOverride,
    metaFromBuilder,
    logger = defaultLogger as unknown as LoadConversationContextOptions["logger"],
    parallelFetchService = defaultParallelFetchService,
    cache = DERIVADOS_CACHE,
    getDerivadosFn = getDerivados,
    insightAberturaFn = insightAbertura,
    withTimeoutOrNullFn = withTimeoutOrNull,
    sleepFn = sleep,
    derivadosTimeoutMs = DEFAULT_DERIVADOS_TIMEOUT_MS,
    paralelasTimeoutMs = DEFAULT_PARALELAS_TIMEOUT_MS,
    onDerivadosError,
    activationTracer,
    retrieveMode = "FAST",
  } = options;

  const shouldSkipDerivados =
    !!promptOverride ||
    (metaFromBuilder && Number(metaFromBuilder?.nivel) === 1) ||
    !userId ||
    !supabase;

  const derivadosCacheKey =
    !shouldSkipDerivados && userId ? `derivados:${userId}` : null;

  const cachedDerivados = derivadosCacheKey
    ? cache.get(derivadosCacheKey) ?? null
    : null;

  const paralelasPromise = promptOverride
    ? Promise.resolve(EMPTY_PARALLEL_RESULT)
    : Promise.race([
        parallelFetchService.run({
          ultimaMsg,
          userId,
          supabase,
          retrieveMode,
        }),
        sleepFn(paralelasTimeoutMs).then(() => EMPTY_PARALLEL_RESULT),
      ]);

  let derivadosFetchPromise: Promise<Derivados | null> | null = null;

  const startDerivadosFetch = () =>
    (async () => {
      try {
        const [{ data: stats }, { data: marcos }, { data: efeitos }] =
          await Promise.all([
            supabase
              .from("user_theme_stats")
              .select("tema,freq_30d,int_media_30d")
              .eq("user_id", userId)
              .order("freq_30d", { ascending: false })
              .limit(5),
            supabase
              .from("user_temporal_milestones")
              .select("tema,resumo_evolucao,marco_at")
              .eq("user_id", userId)
              .order("marco_at", { ascending: false })
              .limit(3),
            supabase
              .from("interaction_effects")
              .select("efeito,score,created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(30),
          ]);

        const arr = (efeitos || []).map((r: any) => ({
          x: { efeito: (r?.efeito as any) ?? "neutro" },
        }));

        const scores = (efeitos || [])
          .map((r: any) => Number(r?.score))
          .filter((v: number) => Number.isFinite(v));

        const media = scores.length
          ? scores.reduce((a: number, b: number) => a + b, 0) /
            scores.length
          : 0;

        return getDerivadosFn(
          (stats || []) as any,
          (marcos || []) as any,
          arr as any,
          media
        );
      } catch (e) {
        onDerivadosError?.(e);
        logger?.warn?.(
          `[derivadosLoader] falha ao buscar derivados: ${(e as Error)?.message}`
        );
        return null;
      }
    })();

  let derivadosPromise: Promise<Derivados | null>;
  if (shouldSkipDerivados) {
    derivadosPromise = Promise.resolve(cachedDerivados ?? null);
  } else if (cachedDerivados) {
    derivadosPromise = Promise.resolve(cachedDerivados);
  } else {
    derivadosFetchPromise = startDerivadosFetch();
    derivadosPromise = withTimeoutOrNullFn(
      derivadosFetchPromise,
      derivadosTimeoutMs,
      "derivados",
      // Cast para evitar conflitos de tipo caso withTimeoutOrNull espere LogAPI completo
      { logger: logger as any }
    );
  }

  const paralelas = await paralelasPromise;
  const derivados = await derivadosPromise;

  const cacheDerivados = (value: Derivados | null) => {
    if (
      !derivadosCacheKey ||
      cachedDerivados ||
      shouldSkipDerivados ||
      !value ||
      typeof value !== "object"
    ) {
      return;
    }
    cache.set(derivadosCacheKey, value);
  };

  if (derivados && typeof derivados === "object") {
    cacheDerivados(derivados);
  } else if (derivadosFetchPromise) {
    derivadosFetchPromise.then(cacheDerivados).catch(() => undefined);
  }

  const heuristicas: any[] = paralelas?.heuristicas ?? [];
  const userEmbedding: number[] = paralelas?.userEmbedding ?? [];
  const memsSemelhantes: any[] = paralelas?.memsSemelhantes ?? [];

  const continuityDecision = decideContinuity(memsSemelhantes);
  const continuityRef = continuityDecision.memoryRef;

  logger?.info?.({
    tag: "continuity_decision",
    hasContinuity: continuityDecision.hasContinuity,
    ref: continuityRef ?? null,
  });

  if (activationTracer) {
    const threshold = 0.8;
    heuristicas.forEach((item: any, index: number) => {
      const evidence = {
        similarity: typeof item?.similarity === "number" ? item.similarity : null,
        tags: Array.isArray(item?.tags) ? item.tags : null,
        origem: item?.origem ?? null,
        index,
      };
      activationTracer.addHeuristic(item?.arquivo || item?.id || `heuristica_${index + 1}`, evidence);
    });
    const topSimilarity =
      heuristicas.length && typeof heuristicas[0]?.similarity === "number"
        ? heuristicas[0].similarity
        : null;
    activationTracer.setEmbeddingResult({
      hits: heuristicas.length,
      similarity: topSimilarity,
      threshold,
    });
  }

  const aberturaHibrida = derivados
    ? (() => {
        try {
          return insightAberturaFn(derivados);
        } catch (e) {
          logger?.warn?.(
            `[derivadosLoader] insightAbertura falhou: ${
              (e as Error)?.message
            }`
          );
          return null;
        }
      })()
    : null;

  return {
    heuristicas,
    userEmbedding,
    memsSemelhantes,
    derivados: (derivados ?? null) as Derivados | null,
    aberturaHibrida,
    flags: { HAS_CONTINUITY: continuityDecision.hasContinuity },
    meta: { continuityRef },
    continuity: {
      hasContinuity: continuityDecision.hasContinuity,
      similarity: continuityDecision.similarity,
      diasDesde: continuityDecision.diasDesde,
      memoryRef: continuityRef,
    },
  };
}
