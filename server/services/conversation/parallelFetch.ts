import { isDebug, log } from "../promptContext/logger";
import { getEmbeddingCached } from "../../adapters/EmbeddingAdapter";
import { buscarHeuristicasSemelhantes } from "../../services/heuristicaService";
import {
  buscarMemoriasComModo,
  type RetrieveMode,
} from "../supabase/memoriaRepository";

export interface ParallelFetchParams {
  ultimaMsg: string;
  userId?: string;
  supabase?: any;
  retrieveMode?: RetrieveMode;
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
