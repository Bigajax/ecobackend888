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
import { loadConversationContext } from "./conversation/derivadosLoader";

/* ---------------------------- Consts ---------------------------- */

/* ----------------------- Utils de estilo ------------------------ */

// Detecta se o usuário pediu explicitamente "passos", "como fazer", etc.
function detectExplicitAskForSteps(text: string): boolean {
  if (!text) return false;
  const rx =
    /\b(passos?|etapas?|como\s+fa(c|ç)o|como\s+fazer|checklist|guia|tutorial|roteiro|lista\s+de|me\s+mostra\s+como|o\s+que\s+fazer)\b/i;
  return rx.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

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

  const {
    heuristicas,
    userEmbedding,
    memsSemelhantes,
    derivados,
    aberturaHibrida,
  } = await loadConversationContext(userId, ultimaMsg, supabase, {
    promptOverride,
    metaFromBuilder,
    logger: log,
  });

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
  const explicitAskForSteps = detectExplicitAskForSteps(ultimaMsg);
  const preferCoachFull =
    !decision.vivaAtivo &&
    (explicitAskForSteps || Number(decision.nivelRoteador) === 1);

  const STYLE_SELECTOR_FULL = preferCoachFull
    ? "Preferir plano COACH (30%): acolher (1 linha) • encorajar com leveza • (opcional) até 3 passos curtos • fechar com incentivo."
    : "Preferir plano ESPELHO (70%): acolher (1 linha) • refletir padrões/sentimento (1 linha) • 1 pergunta aberta • fechar leve.";

  const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: `${STYLE_SELECTOR_FULL}\n${systemPrompt}` },
    ...(messages as any[]).slice(-5).map((m) => ({
      role: mapRoleForOpenAI((m as any).role) as
        | "system"
        | "user"
        | "assistant",
      content: (m as any).content,
    })),
  ];

  const maxTokens =
    ultimaMsg.length < 140 ? 420 : ultimaMsg.length < 280 ? 560 : 700;
  const inicioEco = now();

  let data: any;
  try {
    data = await claudeChatCompletion({
      messages: msgs,
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
