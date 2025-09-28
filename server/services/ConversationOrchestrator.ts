// server/services/ConversationOrchestrator.ts
import {
  ensureEnvs,
  mapRoleForOpenAI,
  now,
  sleep,
  type GetEcoParams,
  type GetEcoResult,
} from "../utils";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { microReflexoLocal } from "../core/ResponseGenerator";
import { claudeChatCompletion } from "../core/ClaudeAdapter";
import { getDerivados, insightAbertura } from "../services/derivadosService";
import { log, isDebug } from "../services/promptContext/logger";
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
import {
  buildFullPrompt,
  detectExplicitAskForSteps,
} from "./conversation/promptPlan";

/* ---------------------------- Consts ---------------------------- */

const DERIVADOS_TIMEOUT_MS = Number(process.env.ECO_DERIVADOS_TIMEOUT_MS ?? 600);
const PARALELAS_TIMEOUT_MS = Number(process.env.ECO_PARALELAS_TIMEOUT_MS ?? 180);

/* ----------------------- Utils de estilo ------------------------ */

/* -------------------------- Identidade MINI --------------------- */

const ID_ECO_MINI =
  "Você é a Eco: espelho socrático de autoconhecimento — reflexiva, curiosa e acolhedora. " +
  "Proporção: 70% espelho (devolver padrões, clarear percepções) + 30% coach gentil (encorajamento, humor leve). " +
  "Tom: reflexivo, claro, acolhedor, levemente bem-humorado. Use português brasileiro natural. " +
  "Cultive: escuta paciente, curiosidade filosófica, espelhamento sensível, incentivo leve. " +
  "Evite: linguagem robótica, jargões de coaching, prescrições, diagnósticos e substituir terapia. " +
  "Objetivo: criar um espaço seguro de reflexão para o usuário se ver com mais clareza, com companhia curiosa e respeitosa.";

const STYLE_HINTS_MINI =
  "Responda curto (1–2 frases) quando possível, claro e acolhedor. Se pedirem passos, no máximo 3 itens.";

/* -------------------------- Fast-lane --------------------------- */

async function fastLaneLLM({
  messages,
  userName,
}: {
  messages: { role: any; content: string }[];
  userName?: string;
}) {
  const nome = firstName(userName);
  const ultima = messages?.length ? (messages as any).at(-1)?.content ?? "" : "";

  const preferCoach = detectExplicitAskForSteps(ultima);
  const STYLE_SELECTOR = preferCoach
    ? "Preferir plano COACH (30%): acolher (1 linha) • encorajar com leveza • (opcional) até 3 passos curtos • fechar com incentivo."
    : "Preferir plano ESPELHO (70%): acolher (1 linha) • refletir padrões/sentimento (1 linha) • 1 pergunta aberta • fechar leve.";

  const system =
    STYLE_SELECTOR +
    " " +
    ID_ECO_MINI +
    " " +
    STYLE_HINTS_MINI +
    " " +
    (nome
      ? `O usuário se chama ${nome}. Use o nome apenas quando fizer sentido. Nunca corrija nomes nem diga frases como 'sou a Eco, não o ${nome}'. `
      : "Nunca corrija nomes. ");

  const slim: Array<{ role: "system" | "user" | "assistant"; content: string }> =
    [
      { role: "system", content: system },
      ...messages.slice(-3).map((m) => ({
        role: mapRoleForOpenAI((m as any).role) as
          | "system"
          | "user"
          | "assistant",
        content: (m as any).content,
      })),
    ];

  let data: any;
  try {
    data = await claudeChatCompletion({
      messages: slim,
      model: process.env.ECO_FAST_MODEL || "anthropic/claude-3-5-haiku",
      temperature: 0.5,
      maxTokens: 220,
    });
  } catch (e: any) {
    log.warn(`[fastLaneLLM] falhou: ${e?.message}`);
    const fallback = "Tô aqui com você. Quer me contar um pouco mais?";
    return { raw: fallback, usage: undefined, model: "fastlane-fallback" };
  }

  const raw: string = data?.content ?? "";
  return { raw, usage: data?.usage, model: data?.model };
}

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
  const supabase = supabaseWithBearer(accessToken);

  const micro = microReflexoLocal(ultimaMsg);
  if (micro) {
    return { message: micro };
  }

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

  if (decision.mode === "fast") {
    const inicioFast = now();
    const fast = await fastLaneLLM({ messages: messages as any, userName });

    return defaultResponseFinalizer.finalize({
      raw: fast.raw,
      ultimaMsg,
      userName,
      hasAssistantBefore: decision.hasAssistantBefore,
      userId,
      supabase,
      lastMessageId: (messages as any).at(-1)?.id ?? undefined,
      mode: "fast",
      startedAt: inicioFast,
      usageTokens: fast?.usage?.total_tokens ?? undefined,
      modelo: fast?.model,
    });
  }

  const shouldSkipDerivados =
    !!promptOverride ||
    (metaFromBuilder && Number(metaFromBuilder.nivel) === 1) ||
    !userId;

  const derivadosCacheKey =
    !shouldSkipDerivados && userId ? `derivados:${userId}` : null;
  const cachedDerivados = derivadosCacheKey
    ? DERIVADOS_CACHE.get(derivadosCacheKey) ?? null
    : null;

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

  const derivadosPromise = shouldSkipDerivados || cachedDerivados
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
              ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
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

  const heuristicas: any[] = paralelas.heuristicas ?? [];
  const userEmbedding: number[] = paralelas.userEmbedding ?? [];
  const memsSemelhantes: any[] = paralelas.memsSemelhantes ?? [];

  const aberturaHibrida = derivados
    ? (() => {
        try {
          return insightAbertura(derivados);
        } catch {
          return null;
        }
      })()
    : null;

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

  // Seleciona estilo para a rota full
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
