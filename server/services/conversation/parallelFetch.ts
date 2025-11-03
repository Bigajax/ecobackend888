import { isDebug, log } from "../promptContext/logger";
import { getEmbeddingCached } from "../../adapters/EmbeddingAdapter";
import { buscarHeuristicasSemelhantes } from "../../services/heuristicaService";
import {
  buscarMemoriasComModo,
  retrieveConfigs,
  type RetrieveMode,
} from "../supabase/memoriaRepository";
import { buscarReferenciasSemelhantes } from "../../services/buscarReferenciasSemelhantes";

export interface ParallelFetchParams {
  ultimaMsg: string;
  userId?: string;
  supabase?: any;
  retrieveMode?: RetrieveMode;
  currentMemoryId?: string | null;
  userIdUsedForInsert?: string | null;
  authUid?: string | null;
}

export interface ParallelFetchResult {
  heuristicas: any[];
  userEmbedding: number[];
  memsSemelhantes: any[];
  sources: {
    heuristicas: "live" | "cache" | "empty";
    mems: "live" | "cache" | "empty";
  };
}

interface ParallelFetchDeps {
  getEmbedding: typeof getEmbeddingCached;
  getHeuristicas: typeof buscarHeuristicasSemelhantes;
  getMemorias: typeof buscarMemoriasComModo;
  getReferencias: typeof buscarReferenciasSemelhantes;
  logger: typeof log;
  debug: typeof isDebug;
}

const RPC_TIMEOUT_MS = 1200;
const CACHE_LIMIT = 5;
const ANON_KEY = "__anon__";

export class ParallelFetchService {
  constructor(
    private readonly deps: ParallelFetchDeps = {
      getEmbedding: getEmbeddingCached,
      getHeuristicas: buscarHeuristicasSemelhantes,
      getMemorias: buscarMemoriasComModo,
      getReferencias: buscarReferenciasSemelhantes,
      logger: log,
      debug: isDebug,
    }
  ) {}

  private heuristicaCache = new Map<string, any[]>();

  private memoriaCache = new Map<string, any[]>();

  async run({
    ultimaMsg,
    userId,
    supabase,
    retrieveMode = "FAST",
    currentMemoryId,
    userIdUsedForInsert,
    authUid,
  }: ParallelFetchParams): Promise<ParallelFetchResult> {
    let userEmbedding: number[] = [];
    const trimmed = (ultimaMsg || "").trim();
    if (trimmed.length > 0) {
      try {
        userEmbedding = await this.deps.getEmbedding(trimmed, "entrada_usuario");
      } catch (e: any) {
        userEmbedding = [];
        this.deps.logger.warn(
          `[ParallelFetch] getEmbedding falhou: ${e?.message ?? "erro desconhecido"}`
        );
      }
    }

    let heuristicas: any[] = [];
    let heuristicaSource: "live" | "cache" | "empty" = "empty";
    let memsSemelhantes: any[] = [];
    let memSource: "live" | "cache" | "empty" = "empty";

    if (userEmbedding.length > 0) {
      const cacheKey = userId ?? ANON_KEY;
      const referenceFallbackThreshold = Number(
        process.env.SEMANTIC_MEMORY_REFERENCE_FALLBACK_THRESHOLD ?? "0.5"
      );
      const referenceThreshold = Number.isFinite(referenceFallbackThreshold)
        ? referenceFallbackThreshold
        : 0.5;
      const referenceK =
        retrieveConfigs[retrieveMode]?.k ??
        Number(process.env.SEMANTIC_MEMORY_REFERENCE_TOP_K ?? 4);

      const heuristicasPromise = withTimeoutOrNull(
        this.deps
          .getHeuristicas({
            usuarioId: userId ?? null,
            userEmbedding,
            matchCount: 4, // LATENCY: top_k
          })
          .catch((error: any) => {
            if (this.deps.debug()) {
              this.deps.logger.warn(
                `[ParallelFetch] heuristica_rpc falhou: ${error?.message}`
              );
            }
            return [];
          }),
        RPC_TIMEOUT_MS,
        "heuristica_rpc",
        { logger: this.deps.logger }
      );

      const memsPromise = userId
        ? withTimeoutOrNull(
            this.deps
              .getMemorias({
                userId,
                embedding: userEmbedding,
                mode: retrieveMode,
                filtros: {
                  currentMemoryId: currentMemoryId ?? null,
                  userIdUsedForInsert: userIdUsedForInsert ?? userId,
                  authUid: authUid ?? null,
                },
                supabaseClient: supabase,
              })
              .catch((e: any) => {
                if (this.deps.debug()) {
                  this.deps.logger.warn(
                    `[ParallelFetch] buscarMemoriasSemelhantes falhou: ${e?.message}`
                  );
                }
                return [];
              }),
            RPC_TIMEOUT_MS,
            "mem_lookup",
            { logger: this.deps.logger }
          ).then((result) => result ?? [])
        : Promise.resolve([]);

      const [heuristicasResult, memsResult] = await Promise.all([
        heuristicasPromise,
        memsPromise,
      ]);

      if (heuristicasResult != null) {
        heuristicas = heuristicasResult ?? [];
        heuristicaSource = heuristicas.length ? "live" : "empty";
        if (heuristicas.length) {
          this.heuristicaCache.set(cacheKey, heuristicas.slice(0, CACHE_LIMIT));
        }
      } else {
        const cached = this.heuristicaCache.get(cacheKey) ?? [];
        heuristicas = cached;
        heuristicaSource = cached.length ? "cache" : "empty";
      }

      if (userId) {
        if (memsResult != null) {
          memsSemelhantes = memsResult ?? [];
          memSource = memsSemelhantes.length ? "live" : "empty";
          if (memsSemelhantes.length) {
            this.memoriaCache.set(cacheKey, memsSemelhantes.slice(0, CACHE_LIMIT));
          } else if (userEmbedding.length > 0) {
            const refsResult = await withTimeoutOrNull(
              this.deps
                .getReferencias(userId, {
                  userEmbedding,
                  k: referenceK,
                  threshold: referenceThreshold,
                })
                .catch((error: any) => {
                  if (this.deps.debug()) {
                    this.deps.logger.warn(
                      `[ParallelFetch] referencias_rpc falhou: ${error?.message}`
                    );
                  }
                  return [];
                }),
              RPC_TIMEOUT_MS,
              "ref_lookup",
              { logger: this.deps.logger }
            );
            if (Array.isArray(refsResult) && refsResult.length) {
              memsSemelhantes = refsResult.map((ref, index) => ({
                id:
                  typeof (ref as any)?.id === "string" && (ref as any).id.trim().length
                    ? (ref as any).id.trim()
                    : `ref_${index}`,
                resumo_eco: ref.resumo_eco,
                tags: Array.isArray(ref.tags) ? ref.tags : [],
                emocao_principal: ref.emocao_principal ?? null,
                intensidade:
                  typeof ref.intensidade === "number" && Number.isFinite(ref.intensidade)
                    ? ref.intensidade
                    : null,
                created_at: ref.created_at ?? null,
                similarity:
                  typeof ref.similarity === "number" && Number.isFinite(ref.similarity)
                    ? ref.similarity
                    : undefined,
                distancia:
                  typeof ref.distancia === "number" && Number.isFinite(ref.distancia)
                    ? ref.distancia
                    : undefined,
              }));
              memSource = "live";
              this.memoriaCache.set(cacheKey, memsSemelhantes.slice(0, CACHE_LIMIT));
            }
          }
        } else {
          const cached = this.memoriaCache.get(cacheKey) ?? [];
          memsSemelhantes = cached;
          memSource = cached.length ? "cache" : "empty";
        }
      }

      if (userId && typeof this.deps.logger?.info === "function") {
        const top = Array.isArray(memsSemelhantes) && memsSemelhantes.length
          ? memsSemelhantes[0]
          : null;
        this.deps.logger.info({
          tag: "mem_probe",
          count: Array.isArray(memsSemelhantes) ? memsSemelhantes.length : 0,
          top: top ?? null,
        });
      }

      if (heuristicaSource === "cache") {
        this.deps.logger.warn("[ParallelFetch] heuristica_cache_fallback", {
          userId: cacheKey,
        });
      }
      if (memSource === "cache") {
        this.deps.logger.warn("[ParallelFetch] memoria_cache_fallback", {
          userId: cacheKey,
        });
      }
      if (memSource === "empty") {
        this.deps.logger.info("[ParallelFetch] memoria_empty", { userId: cacheKey });
      }
    }

    return {
      heuristicas,
      userEmbedding,
      memsSemelhantes,
      sources: {
        heuristicas: heuristicaSource,
        mems: memSource,
      },
    };
  }
}

export async function withTimeoutOrNull<T>(
  promise: Promise<T>,
  ms: number,
  label = "tarefa",
  deps: { logger?: typeof log } = {}
): Promise<T | null> {
  const logger = deps.logger ?? log;
  try {
    return (await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)
      ),
    ])) as T;
  } catch (e: any) {
    logger.warn(`[Orchestrator] ${label} falhou/timeout (${ms}ms): ${e?.message}`);
    return null;
  }
}

export const defaultParallelFetchService = new ParallelFetchService();
