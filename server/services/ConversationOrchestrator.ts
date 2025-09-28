// server/services/ConversationOrchestrator.ts
import {
  ensureEnvs,
  mapRoleForOpenAI,
  now,
  type GetEcoParams,
  type GetEcoResult,
} from "../utils";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { microReflexoLocal } from "../core/ResponseGenerator";
import { claudeChatCompletion } from "../core/ClaudeAdapter";
import { log, isDebug } from "../services/promptContext/logger";

import { defaultGreetingPipeline } from "./conversation/greeting";
import { defaultConversationRouter } from "./conversation/router";
import { defaultContextCache } from "./conversation/contextCache";
import { defaultResponseFinalizer } from "./conversation/responseFinalizer";
import { firstName } from "./conversation/helpers";

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

  // Seleciona estilo e orçamento para a rota full
  const { prompt, maxTokens, msgs } = buildFullPrompt({
    decision,
    ultimaMsg,
    systemPrompt,
    messages: messages as any,
  });

  const inicioEco = now();

  let data: any;
  try {
    data = await claudeChatCompletion({
      messages: [{ role: "system", content: prompt }, ...msgs],
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
