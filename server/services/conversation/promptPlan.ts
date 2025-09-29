import { mapRoleForOpenAI, type ChatMessage } from "../../utils";
import type { RouteDecision } from "./router";

type PromptMessage = { role: "system" | "user" | "assistant"; content: string };

const STYLE_COACH =
  "Preferir plano COACH (30%): acolher (1 linha) • encorajar com leveza • (opcional) até 3 passos curtos • fechar com incentivo.";
const STYLE_ESPELHO =
  "Preferir plano ESPELHO (70%): acolher (1 linha) • refletir padrões/sentimento (1 linha) • 1 pergunta aberta • fechar leve.";

export function detectExplicitAskForSteps(text: string): boolean {
  if (!text) return false;

  const rx =
    /\b(passos?|etapas?|como\s+fa(c|ç)o|como\s+fazer|checklist|guia|tutorial|roteiro|lista\s+de|me\s+mostra\s+como|o\s+que\s+fazer)\b/i;

  return rx.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

export interface BuildFullPromptParams {
  decision: RouteDecision;
  ultimaMsg: string;
  systemPrompt: string;
  messages: ChatMessage[];
  historyLimit?: number;
}

export function buildFullPrompt({
  decision,
  ultimaMsg,
  systemPrompt,
  messages,
  historyLimit = 5,
}: BuildFullPromptParams): { prompt: PromptMessage[]; maxTokens: number } {
  const explicitAskForSteps = detectExplicitAskForSteps(ultimaMsg);
  const preferCoachFull =
    !decision.vivaAtivo &&
    (explicitAskForSteps || Number(decision.nivelRoteador) === 1);

  const STYLE_SELECTOR_FULL = preferCoachFull ? STYLE_COACH : STYLE_ESPELHO;

  const history = (messages ?? []).slice(-historyLimit).map((m) => ({
    role: mapRoleForOpenAI(m.role) as PromptMessage["role"],
    content: m.content,
  }));

  const prompt: PromptMessage[] = [
    { role: "system", content: `${STYLE_SELECTOR_FULL}\n${systemPrompt}` },
    ...history,
  ];

  const ultimaLen = ultimaMsg ? ultimaMsg.length : 0;
  const maxTokens = ultimaLen < 140 ? 420 : ultimaLen < 280 ? 560 : 700;

  return { prompt, maxTokens };
}
