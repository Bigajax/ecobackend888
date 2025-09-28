// server/services/ConversationOrchestrator.ts
import {
  ensureEnvs,
  now,
  sleep,
  type GetEcoParams,
  type GetEcoResult,
} from "../utils";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { microReflexoLocal } from "../core/ResponseGenerator";
import { claudeChatCompletion } from "../core/ClaudeAdapter";
import { log, isDebug } from "../services/promptContext/logger";
import { getDerivados, insightAbertura } from "../services/derivadosService";
import { DERIVADOS_CACHE } from "./CacheService";

import { defaultGreetingPipeline } from "./conversation/greeting";
import { defaultConversationRouter } from "./conversation/router";
import {
  defaultParallelFetchService,
  withTimeoutOrNull,
} from "./conversation/parallelFetch";
import { defaultContextCache } from "./conversation/contextCache";
import { defaultResponseFinalizer } from "./conversation/responseFinalizer";
import { firstName } from "./conversation/helpers";
import { runFastLaneLLM } from "./conversation/fastLane";
import { buildFullPrompt } from "./conversation/promptPlan";

/* ---------------------------- Consts ---------------------------- */

const DERIVADOS_TIMEOUT_MS = Number(process.env.ECO_DERIVADOS_TIMEOUT_MS ?? 600);
const PARALELAS_TIMEOUT_MS = Number(process.env.ECO_PARALELAS_TIMEOUT_MS ?? 180);

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
  }: GetEcoParams & { promptOverride?: string; metaFromBuilder?: any }
): Promise<GetEcoResult> {
  ensureEnvs();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Parâmetro "messages" vazio ou inválido.');
  }

  const ultimaMsg = (messages as any).at(-1)?.content || "";

  // Micro-resposta local
  const micro = microReflexoLocal(ultimaMsg);
  if (micro) {
    return { message: micro };
  }

  // Pipeline de saudação
  const greetingResult = defaultGreetingPipeline.handle({
    messages: messages as any,
    ultimaMsg,
    userId,
    userName,
    clientHour,
    greetingEnabled: process.env.ECO_GREETING_BACKEND_ENABLED !== "0",
  });
  if (greetingResult.handled && greetingResult.response) {
    return { message: greetingResult.response };
  }

  // Roteamento
  const decision = defaultConversationRouter.decide({
    messages: messages as any,
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

  const supabase = supabaseWithBearer(accessToken);

  // --------------------------- FAST MODE ---------------------------
  if (decision.mode === "fast") {
    const inicioFast = now();
    const fast = await runFastLaneLLM({
      messages: messages as any,
      userName,
      ultimaMsg,
      hasAssistantBefore: decision.hasAssistantBefore,
      userId,
      supabase,
      lastMessageId: (messages as any).at(-1)?.id ?? undefined,
      startedAt: inicioFast,
      deps: {
        claudeClient: claudeChatCompletion,
        responseFinalizer: defaultResponseFinalizer,
        firstName,
      },
    });

    return fast.response;
  }

  // --------------------------- FULL MODE ---------------------------
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
  const derivadosPromise =
    shouldSkipDerivados || cachedDerivados
      ? Promise.resolve(cachedDerivados)
      : withTimeoutOrNull(
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
                x: { efeito: (r.efeito as any) ?? "neutro" },
              }));
              const scores = (efeitos || [])
                .map((r: any) => Number(r?.score))
                .filter((v: number) => Number.isFinite(v));
              const media = scores.length
                ? scores.reduce((a: number, b: number) => a + b, 0) /
                  scores.length
                : 0;

              return getDerivados(
                (stats || []) as any,
                (marcos || []) as any,
                arr as any,
                media
              );
            } catch {
              return null;
            }
          })(),
          DERIVADOS_TIMEOUT_MS,
          "derivados",
          { logger: log }
        );

  const paralelas = await paralelasPromise;
  const derivados = await derivadosPromise;

  if (
    derivadosCacheKey &&
    !cachedDerivados &&
    derivados &&
    typeof derivados === "object"
  ) {
    DERIVADOS_CACHE.set(derivadosCacheKey, derivados);
  }

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
  // No seu projeto, buildFullPrompt retorna { prompt: PromptMessage[], maxTokens }
  const { prompt, maxTokens } = buildFullPrompt({
    decision,
    ultimaMsg,
    systemPrompt,
    messages: messages as any,
  });

  const inicioEco = now();

  let data: any;
  try {
    data = await claudeChatCompletion({
      // 'prompt' já é a lista de mensagens pronta (inclui system + histórico fatiado)
      messages: prompt,
      model: process.env.ECO_CLAUDE_MODEL || "anthropic/claude-3-5-sonnet",
      temperature: 0.6,
      maxTokens,
    });
  } catch (e: any) {
    log.warn(`[getEcoResponse] LLM rota completa falhou: ${e?.message}`);
    const msg =
      "Desculpa, tive um problema técnico agora. Topa tentar de novo?";
    return defaultResponseFinalizer.finalize({
      raw: msg,
      ultimaMsg,
      userName,
      hasAssistantBefore: decision.hasAssistantBefore,
      userId,
      supabase,
      lastMessageId: (messages as any).at(-1)?.id ?? undefined,
      mode: "full",
      startedAt: inicioEco,
      usageTokens: undefined,
      modelo: "full-fallback",
      skipBloco: true,
    });
  }

  if (isDebug()) {
    log.debug("[Orchestrator] resposta pronta", {
      duracaoEcoMs: now() - inicioEco,
      lenMensagem: (data?.content || "").length,
    });
  }

  return defaultResponseFinalizer.finalize({
    raw: data?.content ?? "",
    ultimaMsg,
    userName,
    hasAssistantBefore: decision.hasAssistantBefore,
    userId,
    supabase,
    lastMessageId: (messages as any).at(-1)?.id ?? undefined,
    mode: "full",
    startedAt: inicioEco,
    usageTokens: data?.usage?.total_tokens ?? undefined,
    modelo: data?.model,
  });
}

export { getEcoResponse as getEcoResponseOtimizado };
