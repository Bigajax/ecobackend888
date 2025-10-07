import {
  mapRoleForOpenAI,
  type ChatMessage,
  type GetEcoResult,
  type SessionMetadata,
} from "../../utils";
import { log } from "../promptContext/logger";
import type { FinalizeParams } from "./responseFinalizer";
import { detectGenericAutoReply } from "./genericAutoReplyGuard";
import {
  construirRespostaPersonalizada,
  sugerirPlanoResposta,
} from "./responsePlanner";

type ClaudeMessage = { role: "system" | "user" | "assistant"; content: string };

type ClaudeClientResult = {
  content?: string;
  usage?: { total_tokens?: number; [key: string]: unknown } | null;
  model?: string;
};

type ClaudeClientParams = {
  messages: ClaudeMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export interface RunFastLaneLLMDeps {
  claudeClient: (params: ClaudeClientParams) => Promise<ClaudeClientResult>;
  responseFinalizer: { finalize: (params: FinalizeParams) => Promise<GetEcoResult> };
  firstName: (fullName?: string) => string | undefined;
}

export interface RunFastLaneLLMParams {
  messages: ChatMessage[];
  userName?: string;
  ultimaMsg: string;
  hasAssistantBefore: boolean;
  userId?: string;
  supabase?: any;
  lastMessageId?: string;
  startedAt: number;
  deps: RunFastLaneLLMDeps;
  sessionMeta?: SessionMetadata;
}

export interface RunFastLaneLLMResult {
  raw: string;
  usage?: { total_tokens?: number; [key: string]: unknown } | null;
  model?: string;
  response: GetEcoResult;
}

const ASK_FOR_STEPS_REGEX =
  /\b(passos?|etapas?|como\s+fa(c|ç)o|como\s+fazer|checklist|guia|tutorial|roteiro|lista\s+de|me\s+mostra\s+como|o\s+que\s+fazer)\b/i;

const ID_ECO_MINI =
  "Você é a Eco: espelho socrático de autoconhecimento — reflexiva, curiosa e acolhedora. " +
  "Proporção: 70% espelho (devolver padrões, clarear percepções) + 30% coach gentil (encorajamento, humor leve). " +
  "Tom: reflexivo, claro, acolhedor, levemente bem-humorado. Use português brasileiro natural. " +
  "Cultive: escuta paciente, curiosidade filosófica, espelhamento sensível, incentivo leve. " +
  "Evite: linguagem robótica, jargões de coaching, prescrições, diagnósticos e substituir terapia. " +
  "Objetivo: criar um espaço seguro de reflexão para o usuário se ver com mais clareza, com companhia curiosa e respeitosa.";

const STYLE_HINTS_MINI =
  "Responda curto (1–2 frases) quando possível, claro e acolhedor. Se pedirem passos, no máximo 3 itens.";

export function detectExplicitAskForSteps(text: string): boolean {
  if (!text) return false;
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ASK_FOR_STEPS_REGEX.test(normalized);
}

function buildStyleSelector(preferCoach: boolean): string {
  return preferCoach
    ? "Preferir plano COACH (30%): acolher (1 linha) • encorajar com leveza • (opcional) até 3 passos curtos • fechar com incentivo."
    : "Preferir plano ESPELHO (70%): acolher (1 linha) • refletir padrões/sentimento (1 linha) • 1 pergunta aberta • fechar leve.";
}

function montarSystemMessage({
  preferCoach,
  nome,
}: {
  preferCoach: boolean;
  nome?: string;
}): string {
  const style = buildStyleSelector(preferCoach);
  const nameHint = nome
    ? `O usuário se chama ${nome}. Use o nome apenas quando fizer sentido. Nunca corrija nomes nem diga frases como 'sou a Eco, não o ${nome}'. `
    : "Nunca corrija nomes. ";

  return `${style} ${ID_ECO_MINI} ${STYLE_HINTS_MINI} ${nameHint}`;
}

function montarSlimHistory(messages: RunFastLaneLLMParams["messages"]): ClaudeMessage[] {
  const history = Array.isArray(messages) ? messages : [];
  const turns = history.slice(-3).map((m) => ({
    role: mapRoleForOpenAI(m.role) as ClaudeMessage["role"],
    content: m.content,
  }));

  return turns;
}

export async function runFastLaneLLM({
  messages,
  userName,
  ultimaMsg,
  hasAssistantBefore,
  userId,
  supabase,
  lastMessageId,
  startedAt,
  deps,
  sessionMeta,
}: RunFastLaneLLMParams): Promise<RunFastLaneLLMResult> {
  const nome = deps.firstName?.(userName);
  const preferCoach = detectExplicitAskForSteps(ultimaMsg);
  const system = montarSystemMessage({ preferCoach, nome });
  const slimHistory = montarSlimHistory(messages);

  const payload: ClaudeClientParams = {
    messages: [{ role: "system", content: system }, ...slimHistory],
    model: process.env.ECO_FAST_MODEL || "anthropic/claude-3-5-haiku",
    temperature: 0.5,
    maxTokens: 220,
  };

  let completion: ClaudeClientResult | undefined;
  try {
    completion = await deps.claudeClient(payload);
  } catch (error: any) {
    log.warn(`[fastLaneLLM] falhou: ${error?.message}`);
    const fallback = "Tô aqui com você. Quer me contar um pouco mais?";
    const response = await deps.responseFinalizer.finalize({
      raw: fallback,
      ultimaMsg,
      userName,
      hasAssistantBefore,
      userId,
      supabase,
      lastMessageId,
      mode: "fast",
      startedAt,
      usageTokens: undefined,
      modelo: "fastlane-fallback",
      sessionMeta,
      sessaoId: sessionMeta?.sessaoId ?? undefined,
      origemSessao: sessionMeta?.origem ?? undefined,
    });

    return { raw: fallback, usage: null, model: "fastlane-fallback", response };
  }

  const raw = completion?.content ?? "";
  const usage = completion?.usage ?? null;
  const model = completion?.model;

  const genericCheck = detectGenericAutoReply(raw);
  const needsPersonalization = genericCheck.isGeneric;

  const plan = needsPersonalization ? sugerirPlanoResposta(ultimaMsg) : null;
  const finalRaw = needsPersonalization
    ? construirRespostaPersonalizada(ultimaMsg, plan!)
    : raw;

  const response = await deps.responseFinalizer.finalize({
    raw: finalRaw,
    ultimaMsg,
    userName,
    hasAssistantBefore,
    userId,
    supabase,
    lastMessageId,
    mode: "fast",
    startedAt,
    usageTokens: usage?.total_tokens ?? undefined,
    modelo: model,
    sessionMeta,
    sessaoId: sessionMeta?.sessaoId ?? undefined,
    origemSessao: sessionMeta?.origem ?? undefined,
  });

  if (plan) {
    response.plan = plan;
    response.planContext = {
      origem: "auto_reply_guard",
      motivos: genericCheck.matches,
    };
  }

  return { raw: finalRaw, usage, model, response };
}

export type { ClaudeClientParams, ClaudeClientResult };
