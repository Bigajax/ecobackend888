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
}

interface ParallelFetchDeps {
  getEmbedding: typeof getEmbeddingCached;
  getHeuristicas: typeof buscarHeuristicasSemelhantes;
  getMemorias: typeof buscarMemoriasComModo;
  logger: typeof log;
  debug: typeof isDebug;
}

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
    let memsSemelhantes: any[] = [];

    if (userEmbedding.length > 0) {
      const heuristicasPromise = this.deps
        .getHeuristicas({
          usuarioId: userId ?? null,
          userEmbedding,
          matchCount: 4, // LATENCY: top_k
        })
        .catch(() => []);

      const memsPromise = userId
        ? this.deps
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
            })
        : Promise.resolve([]);

      const [heuristicasResult, memsResult] = await Promise.all([
        heuristicasPromise,
        memsPromise,
      ]);

      heuristicas = heuristicasResult ?? [];
      memsSemelhantes = userId ? memsResult ?? [] : [];
    }

    return { heuristicas, userEmbedding, memsSemelhantes };
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
