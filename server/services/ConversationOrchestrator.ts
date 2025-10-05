// server/services/ConversationOrchestrator.ts
import {
  ensureEnvs,
  now,
  sleep,
  mapRoleForOpenAI,
  type GetEcoParams,
  type GetEcoResult,
  type ChatMessage,
} from "../utils";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { microReflexoLocal } from "../core/ResponseGenerator";
import {
  claudeChatCompletion,
  streamClaudeChatCompletion,
  type ClaudeStreamControlEvent,
  type ORUsage,
} from "../core/ClaudeAdapter";
import { log, isDebug } from "../services/promptContext/logger";
import { getDerivados, insightAbertura } from "../services/derivadosService";
import { DERIVADOS_CACHE } from "./CacheService";

import { defaultGreetingPipeline } from "./conversation/greeting";
import { defaultConversationRouter } from "./conversation/router";
import { defaultParallelFetchService } from "./conversation/parallelFetch";
import { defaultContextCache } from "./conversation/contextCache";
import {
  defaultResponseFinalizer,
  type NormalizedEcoResponse,
  type PrecomputedFinalizeArtifacts,
} from "./conversation/responseFinalizer";
import { firstName } from "./conversation/helpers";
import { runFastLaneLLM } from "./conversation/fastLane";
import { buildFullPrompt } from "./conversation/promptPlan";

export function buildFinalizedStreamText(result: GetEcoResult): string {
  const intensidade = typeof result.intensidade === "number" ? result.intensidade : null;
  const resumo = typeof result.resumo === "string" ? result.resumo : null;
  const emocao = typeof result.emocao === "string" ? result.emocao : null;
  const tags = Array.isArray(result.tags) ? result.tags : [];
  const categoria = typeof result.categoria === "string" ? result.categoria : null;
  const proactive = result.proactive ?? null;

  const payload: Record<string, unknown> = {
    intensidade,
    resumo,
    emocao,
    tags,
    categoria,
    proactive,
  };

  const hasMeta =
    intensidade !== null ||
    (typeof resumo === "string" && resumo.trim() !== "") ||
    (typeof emocao === "string" && emocao.trim() !== "") ||
    (Array.isArray(tags) && tags.length > 0) ||
    (typeof categoria === "string" && categoria.trim() !== "") ||
    proactive !== null;

  if (!hasMeta) {
    return result.message ?? "";
  }

  return `${result.message ?? ""}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

function buildStreamingMetaPayload(
  bloco: any,
  cleanedFallback: string
): EcoStreamMetaPayload | null {
  if (!bloco || typeof bloco !== "object") {
    return null;
  }

  const intensidade =
    typeof bloco.intensidade === "number" && Number.isFinite(bloco.intensidade)
      ? bloco.intensidade
      : null;
  const resumo =
    typeof bloco.analise_resumo === "string" ? bloco.analise_resumo.trim() : "";
  const emocao =
    typeof bloco.emocao_principal === "string" ? bloco.emocao_principal.trim() : "";
  const categoria =
    typeof bloco.categoria === "string" ? bloco.categoria.trim() : "";
  const tags = Array.isArray(bloco.tags)
    ? bloco.tags
        .map((tag: any) => (typeof tag === "string" ? tag.trim() : ""))
        .filter((tag: string) => tag.length > 0)
    : [];

  if (
    intensidade === null ||
    resumo.length === 0 ||
    emocao.length === 0 ||
    categoria.length === 0 ||
    tags.length === 0
  ) {
    return null;
  }

  return {
    intensidade,
    resumo: resumo || cleanedFallback,
    emocao,
    categoria,
    tags,
  };
}

/* ---------------------------- Consts ---------------------------- */

const DERIVADOS_TIMEOUT_MS = Number(process.env.ECO_DERIVADOS_TIMEOUT_MS ?? 600);
const PARALELAS_TIMEOUT_MS = Number(process.env.ECO_PARALELAS_TIMEOUT_MS ?? 180);
const BLOCO_DEADLINE_MS = Number(process.env.ECO_BLOCO_DEADLINE_MS ?? 5000);
const BLOCO_PENDING_MS = Number(process.env.ECO_BLOCO_PENDING_MS ?? 1000);

interface EcoStreamMetaPayload {
  intensidade: number;
  resumo: string;
  emocao: string;
  categoria: string;
  tags: string[];
}

export interface EcoLatencyMarks {
  contextBuildStart?: number;
  contextBuildEnd?: number;
  llmStart?: number;
  llmEnd?: number;
}

export type EcoStreamEvent =
  | {
      type: "control";
      name: "prompt_ready" | "first_token" | "reconnect";
      attempt?: number;
      timings?: EcoLatencyMarks;
    }
  | {
      type: "control";
      name: "done";
      meta?: { finishReason?: string | null; usage?: ORUsage; modelo?: string | null; length?: number };
      timings?: EcoLatencyMarks;
    }
  | {
      type: "control";
      name: "meta_pending";
    }
  | {
      type: "control";
      name: "meta";
      meta: EcoStreamMetaPayload;
    }
  | {
      // ✅ NOVO: evento emitido após persistir a memória via RPC
      type: "control";
      name: "memory_saved";
      meta: {
        memoriaId: string;
        primeiraMemoriaSignificativa: boolean;
        intensidade: number;
      };
    }
  | { type: "chunk"; content: string; index: number }
  | { type: "error"; error: Error };

export interface EcoStreamHandler {
  onEvent: (event: EcoStreamEvent) => void | Promise<void>;
}

export interface EcoStreamingResult {
  raw: string;
  modelo?: string | null;
  usage?: ORUsage;
  finalize: () => Promise<GetEcoResult>;
  timings: EcoLatencyMarks;
}

/* ---------------------- RPC Memory Helper ---------------------- */
/** Salva memória via RPC registrar_memoria (idempotente para milestone) e
 * retorna se é a primeira memória >=7 para o usuário (primeira = true). */
async function salvarMemoriaViaRPC(opts: {
  supabase: any;                    // Supabase client já autenticado com bearer do usuário
  userId: string;
  mensagemId?: string | null;
  meta: EcoStreamMetaPayload;       // { intensidade, resumo, emocao, categoria, tags }
  origem?: string;                  // "streaming_bloco" | "full_sync"
}) {
  const { supabase, userId, mensagemId, meta, origem = "streaming_bloco" } = opts;

  if (meta.intensidade < 7) {
    return { saved: false as const, primeira: false, memoriaId: null as string | null };
  }

  const { data, error } = await supabase.rpc("registrar_memoria", {
    p_usuario: userId,
    p_texto: meta.resumo ?? "",
    p_intensidade: meta.intensidade,
    p_tags: (meta.tags && meta.tags.length ? meta.tags : null),
    p_dominio_vida: meta.categoria ?? null,
    p_padrao_comportamental: null,
    p_meta: {
      origem,
      mensagem_id: mensagemId ?? null,
      emocao_principal: meta.emocao ?? null,
    }
  });

  if (error) {
    log.warn("[registrar_memoria RPC] erro ao salvar memoria", { message: error.message });
    return { saved: false as const, primeira: false, memoriaId: null as string | null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    saved: true as const,
    primeira: !!row?.primeira,
    memoriaId: row?.id ?? null
  };
}

export function getEcoResponse(
  params: GetEcoParams & { promptOverride?: string; metaFromBuilder?: any }
): Promise<GetEcoResult>;
export function getEcoResponse(
  params: GetEcoParams & {
    promptOverride?: string;
    metaFromBuilder?: any;
    stream: EcoStreamHandler;
  }
): Promise<EcoStreamingResult>;

/* -------------------------- Orquestrador ------------------------ */

export async function getEcoResponse(
  {
    messages,
    userId,
    userName,
    accessToken,
    mems = [],
    forcarMetodoViva = false,
    blocoTecnicoForcado = null,
    clientHour,
    promptOverride,
    metaFromBuilder,
    sessionMeta,
    stream,
  }: GetEcoParams & { promptOverride?: string; metaFromBuilder?: any; stream?: EcoStreamHandler }
): Promise<GetEcoResult | EcoStreamingResult> {
  ensureEnvs();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Parâmetro "messages" vazio ou inválido.');
  }

  const thread: ChatMessage[] = messages;
  const lastMessage = thread.at(-1);
  const lastMessageId = lastMessage?.id;
  const ultimaMsg = lastMessage?.content ?? "";

  const streamHandler = stream ?? null;
  const timings: EcoLatencyMarks = {};
  const emitStream = async (event: EcoStreamEvent) => {
    if (!streamHandler) return;
    await streamHandler.onEvent(event);
  };

  const supabase = supabaseWithBearer(accessToken);
  const hasAssistantBeforeInThread = thread
    .slice(0, -1)
    .some((msg) => mapRoleForOpenAI(msg.role) === "assistant");

  // Micro-resposta local
  const micro = microReflexoLocal(ultimaMsg);
  if (micro) {
    const startedAt = now();
    const finalized = await defaultResponseFinalizer.finalize({
      raw: micro,
      ultimaMsg,
      userName,
      hasAssistantBefore: hasAssistantBeforeInThread,
      userId,
      supabase,
      lastMessageId: lastMessageId ?? undefined,
      mode: "fast",
      startedAt,
      usageTokens: undefined,
      modelo: "micro-reflexo",
      sessionMeta,
      sessaoId: sessionMeta?.sessaoId ?? undefined,
      origemSessao: sessionMeta?.origem ?? undefined,
    });
    const finalText = buildFinalizedStreamText(finalized);

    if (streamHandler) {
      await emitStream({ type: "control", name: "prompt_ready" });
      await emitStream({ type: "control", name: "first_token" });
      await emitStream({ type: "chunk", content: finalText, index: 0 });
      await emitStream({
        type: "control",
        name: "done",
        meta: { length: finalText.length, modelo: "micro-reflexo" },
      });
      const finalize = async () => finalized;
      return {
        raw: finalText,
        modelo: "micro-reflexo",
        usage: undefined,
        finalize,
        timings: {},
      };
    }
    return finalized;
  }

  // Pipeline de saudação
  const greetingResult = defaultGreetingPipeline.handle({
    messages: thread,
    ultimaMsg,
    userId,
    userName,
    clientHour,
    greetingEnabled: process.env.ECO_GREETING_BACKEND_ENABLED !== "0",
  });
  if (greetingResult.handled && greetingResult.response) {
    const startedAt = now();
    const finalized = await defaultResponseFinalizer.finalize({
      raw: greetingResult.response,
      ultimaMsg,
      userName,
      hasAssistantBefore: hasAssistantBeforeInThread,
      userId,
      supabase,
      lastMessageId: lastMessageId ?? undefined,
      mode: "fast",
      startedAt,
      usageTokens: undefined,
      modelo: "greeting",
      sessionMeta,
      sessaoId: sessionMeta?.sessaoId ?? undefined,
      origemSessao: sessionMeta?.origem ?? undefined,
    });
    const finalText = buildFinalizedStreamText(finalized);

    if (streamHandler) {
      await emitStream({ type: "control", name: "prompt_ready" });
      await emitStream({ type: "control", name: "first_token" });
      await emitStream({ type: "chunk", content: finalText, index: 0 });
      await emitStream({
        type: "control",
        name: "done",
        meta: { length: finalText.length, modelo: "greeting" },
      });
      const finalize = async () => finalized;
      return {
        raw: finalText,
        modelo: "greeting",
        usage: undefined,
        finalize,
        timings: {},
      };
    }
    return finalized;
  }

  // Roteamento
  const decision = defaultConversationRouter.decide({
    messages: thread,
    ultimaMsg,
    forcarMetodoViva,
    promptOverride,
  });

  if (isDebug()) {
    log.debug("[Orchestrator] flags", {
      promptOverrideLen: (promptOverride || "").trim().length,
      low: decision.lowComplexity,
      vivaAtivo: decision.vivaAtivo,
      nivelRoteador: decision.nivelRoteador,
      ultimaLen: (ultimaMsg || "").length,
      mode: decision.mode,
    });
  }

  // --------------------------- FAST MODE ---------------------------
  if (decision.mode === "fast" && !streamHandler) {
    const inicioFast = now();
    const fast = await runFastLaneLLM({
      messages: thread,
      userName,
      ultimaMsg,
      hasAssistantBefore: decision.hasAssistantBefore,
      userId,
      supabase,
      lastMessageId: lastMessageId ?? undefined,
      startedAt: inicioFast,
      deps: {
        claudeClient: claudeChatCompletion,
        responseFinalizer: defaultResponseFinalizer,
        firstName,
      },
      sessionMeta,
    });

    return fast.response;
  }

  // --------------------------- FULL MODE ---------------------------
  timings.contextBuildStart = now();
  log.info("// LATENCY: context_build_start", { at: timings.contextBuildStart });
  const shouldSkipDerivados =
    !!promptOverride ||
    (metaFromBuilder && Number(metaFromBuilder.nivel) === 1) ||
    !userId;

  const derivadosCacheKey =
    !shouldSkipDerivados && userId ? `derivados:${userId}` : null;
  const cachedDerivados = derivadosCacheKey
    ? DERIVADOS_CACHE.get(derivadosCacheKey) ?? null
    : null;

  // Paralelos (heurísticas, embedding e memórias semelhantes) com guarda de timeout
  const paralelasPromise = promptOverride
    ? Promise.resolve({
        heuristicas: [],
        userEmbedding: [],
        memsSemelhantes: [],
      })
    : Promise.race([
        defaultParallelFetchService.run({ ultimaMsg, userId, supabase }),
        sleep(PARALELAS_TIMEOUT_MS).then(() => ({
          heuristicas: [],
          userEmbedding: [],
          memsSemelhantes: [],
        })),
      ]);

  // Derivados com cache + timeout
  const derivadosTimeoutToken = Symbol("derivados_timeout");
  let derivadosPromise: Promise<any | null>;

  if (shouldSkipDerivados) {
    derivadosPromise = Promise.resolve(cachedDerivados ?? null);
  } else if (cachedDerivados) {
    derivadosPromise = Promise.resolve(cachedDerivados);
  } else {
    const fetchPromise = (async () => {
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
          x: { efeito: (r.efeito as any) ?? "neutro" },
        }));
        const scores = (efeitos || [])
          .map((r: any) => Number(r?.score))
          .filter((v: number) => Number.isFinite(v));
        const media = scores.length
          ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
          : 0;

        return getDerivados(
          (stats || []) as any,
          (marcos || []) as any,
          arr as any,
          media
        );
      } catch (error) {
        if (isDebug()) {
          const message = error instanceof Error ? error.message : String(error);
          log.debug("[Orchestrator] derivados fetch falhou", { message });
        }
        return null;
      }
    })();

    const backgroundPromise = fetchPromise
      .then((result) => {
        if (
          derivadosCacheKey &&
          result &&
          typeof result === "object"
        ) {
          DERIVADOS_CACHE.set(derivadosCacheKey, result);
        }
        return result;
      })
      .catch((error) => {
        if (isDebug()) {
          const message = error instanceof Error ? error.message : String(error);
          log.debug("[Orchestrator] derivados background falhou", { message });
        }
        return null;
      });

    derivadosPromise = Promise.race([
      backgroundPromise,
      sleep(DERIVADOS_TIMEOUT_MS).then(() => derivadosTimeoutToken),
    ]).then((result) => {
      if (result === derivadosTimeoutToken) {
        return null;
      }
      return (result as any) ?? null;
    });
  }

  const paralelas = await paralelasPromise;
  const derivados = (await derivadosPromise) ?? null;

  const heuristicas: any[] = paralelas?.heuristicas ?? [];
  const userEmbedding: number[] = paralelas?.userEmbedding ?? [];
  const memsSemelhantes: any[] = paralelas?.memsSemelhantes ?? [];

  const aberturaHibrida =
    derivados
      ? (() => {
          try {
            return insightAbertura(derivados);
          } catch {
            return null;
          }
        })()
      : null;

  // System prompt final (ou override)
  const systemPrompt =
    promptOverride ??
    (await defaultContextCache.build({
      userId,
      userName,
      perfil: null,
      mems,
      memoriasSemelhantes: memsSemelhantes,
      forcarMetodoViva: decision.vivaAtivo,
      blocoTecnicoForcado,
      texto: ultimaMsg,
      heuristicas,
      userEmbedding,
      skipSaudacao: true,
      derivados,
      aberturaHibrida,
    }));

  // Planejamento de prompt (seleção de estilo e orçamento)
  const { prompt, maxTokens } = buildFullPrompt({
    decision,
    ultimaMsg,
    systemPrompt,
    messages: thread,
  });

  timings.contextBuildEnd = now();
  log.info("// LATENCY: context_build_end", {
    at: timings.contextBuildEnd,
    durationMs:
      timings.contextBuildStart && timings.contextBuildEnd
        ? timings.contextBuildEnd - timings.contextBuildStart
        : undefined,
  });

  let inicioEco = now();
  const principalModel = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-3-5-sonnet";

  if (streamHandler) {
    const streamedChunks: string[] = [];
    let chunkIndex = 0;
    let firstTokenSent = false;
    let usageFromStream: ORUsage | undefined;
    let finishReason: string | null | undefined;
    let modelFromStream: string | null | undefined;
    let streamFailure: Error | null = null;

    // DEFINITE ASSIGNMENT
    let resolveRawForBloco!: (value: string) => void;
    let rejectRawForBloco!: (reason?: unknown) => void;
    const rawForBlocoPromise = new Promise<string>((resolve, reject) => {
      resolveRawForBloco = resolve;
      rejectRawForBloco = reject;
    });

    type StreamingBlocoArtifacts = {
      normalized: NormalizedEcoResponse;
      blocoPromise: Promise<any | null>;
      blocoRacePromise: Promise<any | null>;
    };

    let blocoSetupPromise: Promise<StreamingBlocoArtifacts> | null = null;
    let blocoPendingTimer: NodeJS.Timeout | null = null;
    let blocoDeadlineTimer: NodeJS.Timeout | null = null;

    const startBlocoPipeline = () => {
      if (blocoSetupPromise) return;
      blocoSetupPromise = (async () => {
        try {
          const rawForBloco = await rawForBlocoPromise;
          const normalized = defaultResponseFinalizer.normalizeRawResponse({
            raw: rawForBloco,
            userName,
            hasAssistantBefore: decision.hasAssistantBefore,
            mode: "full",
          });

          const blocoTimeout = defaultResponseFinalizer.gerarBlocoComTimeout({
            ultimaMsg,
            blocoTarget: normalized.blocoTarget,
            mode: "full",
            skipBloco: false,
            distinctId: sessionMeta?.distinctId ?? userId,
            userId,
          });

          const blocoPromise = blocoTimeout.full;
          const blocoRacePromise = blocoTimeout.race;

          let settled = false;
          let deadlineExceeded = false;
          const blocoStartedAt = now();

          const clearPending = () => {
            if (blocoPendingTimer) {
              clearTimeout(blocoPendingTimer);
              blocoPendingTimer = null;
            }
          };

          const clearDeadline = () => {
            if (blocoDeadlineTimer) {
              clearTimeout(blocoDeadlineTimer);
              blocoDeadlineTimer = null;
            }
          };

          blocoPromise
            .catch(() => undefined)
            .finally(() => {
              settled = true;
              clearPending();
              clearDeadline();
            });

          blocoPendingTimer = setTimeout(() => {
            if (settled || deadlineExceeded) return;
            log.info("[StreamingBloco] state=pending", {
              pendingMs: BLOCO_PENDING_MS,
              deadlineMs: BLOCO_DEADLINE_MS,
            });
            void emitStream({ type: "control", name: "meta_pending" });
            blocoPendingTimer = null;
          }, BLOCO_PENDING_MS);

          blocoDeadlineTimer = setTimeout(() => {
            if (settled) return;
            deadlineExceeded = true;
            clearPending();
            log.warn("[StreamingBloco] state=deadline_exceeded", {
              deadlineMs: BLOCO_DEADLINE_MS,
            });
            blocoDeadlineTimer = null;
          }, BLOCO_DEADLINE_MS);

          blocoRacePromise
            .then(async (payload) => {
              if (deadlineExceeded) return;

              const durationMs = now() - blocoStartedAt;
              if (!payload) {
                log.info("[StreamingBloco] state=success", { durationMs, emitted: false });
                return;
              }

              const metaPayload = buildStreamingMetaPayload(payload, normalized.cleaned);
              if (!metaPayload) {
                log.warn("[StreamingBloco] bloco payload inválido; meta não emitido", { durationMs });
                return;
              }

              log.info("[StreamingBloco] state=success", { durationMs, emitted: true });
              // 1) Emite meta com os campos do bloco
              await emitStream({ type: "control", name: "meta", meta: metaPayload });

              // 2) Salva via RPC e emite memory_saved se aplicável
              try {
                const rpcRes = await salvarMemoriaViaRPC({
                  supabase,
                  userId,
                  mensagemId: lastMessageId ?? null,
                  meta: metaPayload,
                  origem: "streaming_bloco",
                });

                if (rpcRes.saved && rpcRes.memoriaId) {
                  await emitStream({
                    type: "control",
                    name: "memory_saved",
                    meta: {
                      memoriaId: rpcRes.memoriaId,
                      primeiraMemoriaSignificativa: !!rpcRes.primeira,
                      intensidade: metaPayload.intensidade,
                    },
                  });
                }
              } catch (e: any) {
                log.warn("[StreamingBloco] salvarMemoriaViaRPC falhou (ignorado)", { message: e?.message });
              }
            })
            .catch((error) => {
              if (deadlineExceeded) return;
              const message = error instanceof Error ? error.message : String(error);
              log.warn("[StreamingBloco] bloco promise rejected", { message });
            });

          return { normalized, blocoPromise, blocoRacePromise };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log.warn("[StreamingBloco] failed to start bloco", { message });
          throw error;
        }
      })();
    };

    timings.llmStart = now();
    inicioEco = timings.llmStart;
    log.info("// LATENCY: llm_request_start", {
      at: timings.llmStart,
      sincePromptReadyMs:
        timings.contextBuildEnd && timings.llmStart
          ? timings.llmStart - timings.contextBuildEnd
          : undefined,
    });

    const streamPromise = streamClaudeChatCompletion(
      {
        messages: prompt,
        model: principalModel,
        temperature: 0.6,
        maxTokens,
      },
      {
        async onChunk({ content }) {
          if (!content) return;
          streamedChunks.push(content);
          if (!firstTokenSent) {
            firstTokenSent = true;
            await emitStream({ type: "control", name: "first_token" });
          }
          const currentIndex = chunkIndex;
          chunkIndex += 1;
          await emitStream({ type: "chunk", content, index: currentIndex });
        },
        async onControl(event: ClaudeStreamControlEvent) {
          if (event.type === "reconnect") {
            await emitStream({
              type: "control",
              name: "reconnect",
              attempt: event.attempt,
            });
            return;
          }
          if (event.type === "done") {
            usageFromStream = event.usage ?? usageFromStream;
            finishReason = event.finishReason ?? finishReason;
            modelFromStream = event.model ?? modelFromStream;
          }
        },
        async onError(error: Error) {
          streamFailure = error;
          rejectRawForBloco(error);
          await emitStream({ type: "error", error });
        },
      }
    ).catch((error: any) => {
      const err = error instanceof Error ? error : new Error(String(error));
      streamFailure = err;
      rejectRawForBloco(err);
      throw err;
    });

    startBlocoPipeline();

    const promptReadySnapshot = { ...timings };
    await emitStream({ type: "control", name: "prompt_ready", timings: promptReadySnapshot });

    try {
      await streamPromise;
    } finally {
      timings.llmEnd = now();
      log.info("// LATENCY: llm_request_end", {
        at: timings.llmEnd,
        durationMs:
          timings.llmStart && timings.llmEnd
            ? timings.llmEnd - timings.llmStart
            : undefined,
      });
    }

    if (streamFailure) {
      throw streamFailure;
    }

    const raw = streamedChunks.join("");
    resolveRawForBloco(raw);

    let finalizePromise: Promise<GetEcoResult> | null = null;
    const finalize = () => {
      if (!finalizePromise) {
        finalizePromise = (async () => {
          let precomputed: PrecomputedFinalizeArtifacts | undefined;
          if (blocoSetupPromise) {
            try {
              const artifacts = await blocoSetupPromise;
              precomputed = {
                normalized: artifacts.normalized,
                blocoPromise: artifacts.blocoPromise,
                blocoRacePromise: artifacts.blocoRacePromise,
              };
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              log.warn("[StreamingBloco] finalize ignoring precomputed bloco", { message });
            }
          }

          return defaultResponseFinalizer.finalize({
            raw,
            ultimaMsg,
            userName,
            hasAssistantBefore: decision.hasAssistantBefore,
            userId,
            supabase,
            lastMessageId: lastMessageId ?? undefined,
            mode: "full",
            startedAt: inicioEco,
            usageTokens: usageFromStream?.total_tokens ?? undefined,
            modelo: modelFromStream ?? principalModel,
            sessionMeta,
            sessaoId: sessionMeta?.sessaoId ?? undefined,
            origemSessao: sessionMeta?.origem ?? undefined,
            precomputed,
          });
        })();
      }
      return finalizePromise;
    };

    const doneSnapshot = { ...timings };
    await emitStream({
      type: "control",
      name: "done",
      meta: {
        finishReason,
        usage: usageFromStream,
        modelo: modelFromStream ?? principalModel,
        length: raw.length,
      },
      timings: doneSnapshot,
    });

    return {
      raw,
      modelo: modelFromStream ?? principalModel,
      usage: usageFromStream,
      finalize,
      timings: doneSnapshot,
    };
  }

  // ---------------------- Caminho sem streaming ----------------------
  let data: any;
  timings.llmStart = now();
  inicioEco = timings.llmStart;
  log.info("// LATENCY: llm_request_start", {
    at: timings.llmStart,
    sincePromptReadyMs:
      timings.contextBuildEnd && timings.llmStart
        ? timings.llmStart - timings.contextBuildEnd
        : undefined,
  });
  try {
    data = await claudeChatCompletion({
      messages: prompt,
      model: principalModel,
      temperature: 0.6,
      maxTokens,
    });
  } catch (e: any) {
    log.warn(`[getEcoResponse] LLM rota completa falhou: ${e?.message}`);
    const msg = "Desculpa, tive um problema técnico agora. Topa tentar de novo?";
    return defaultResponseFinalizer.finalize({
      raw: msg,
      ultimaMsg,
      userName,
      hasAssistantBefore: decision.hasAssistantBefore,
      userId,
      supabase,
      lastMessageId: lastMessageId ?? undefined,
      mode: "full",
      startedAt: inicioEco,
      usageTokens: undefined,
      modelo: "full-fallback",
      skipBloco: true,
      sessionMeta,
      sessaoId: sessionMeta?.sessaoId ?? undefined,
      origemSessao: sessionMeta?.origem ?? undefined,
    });
  }

  timings.llmEnd = now();
  log.info("// LATENCY: llm_request_end", {
    at: timings.llmEnd,
    durationMs:
      timings.llmStart && timings.llmEnd ? timings.llmEnd - timings.llmStart : undefined,
  });

  if (isDebug()) {
    log.debug("[Orchestrator] resposta pronta", {
      duracaoEcoMs: now() - inicioEco,
      lenMensagem: (data?.content || "").length,
    });
  }

  const finalized = await defaultResponseFinalizer.finalize({
    raw: data?.content ?? "",
    ultimaMsg,
    userName,
    hasAssistantBefore: decision.hasAssistantBefore,
    userId,
    supabase,
    lastMessageId: lastMessageId ?? undefined,
    mode: "full",
    startedAt: inicioEco,
    usageTokens: data?.usage?.total_tokens ?? undefined,
    modelo: data?.model,
    sessionMeta,
    sessaoId: sessionMeta?.sessaoId ?? undefined,
    origemSessao: sessionMeta?.origem ?? undefined,
  });

  // Persistência via RPC também no modo não-streaming
  try {
    const metaPayload = buildStreamingMetaPayload(
      {
        intensidade: finalized.intensidade,
        analise_resumo: finalized.resumo,
        emocao_principal: finalized.emocao,
        categoria: finalized.categoria,
        tags: finalized.tags,
      } as any,
      finalized.message ?? ""
    );

    if (metaPayload && metaPayload.intensidade >= 7) {
      const rpcRes = await salvarMemoriaViaRPC({
        supabase,
        userId,
        mensagemId: (thread.at(-1)?.id as string) ?? null,
        meta: metaPayload,
        origem: "full_sync",
      });
      if (rpcRes.saved) {
        log.info("[FullSync] memoria salva via RPC", {
          memoriaId: rpcRes.memoriaId,
          primeira: rpcRes.primeira,
        });
      }
    }
  } catch (e: any) {
    log.warn("[FullSync] salvarMemoriaViaRPC falhou (ignorado)", { message: e?.message });
  }

  return finalized;
}

export { getEcoResponse as getEcoResponseOtimizado };
