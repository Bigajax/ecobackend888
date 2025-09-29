import { mapRoleForOpenAI, type ChatMessage } from "../../utils";
import { GreetGuard } from "../../core/policies/GreetGuard";
import {
  respostaSaudacaoAutomatica,
  MAX_LEN_FOR_GREETING,
  type Msg as SaudacaoMsg,
} from "../../utils/respostaSaudacaoAutomatica";

export interface GreetingPipelineParams {
  messages: ChatMessage[];
  ultimaMsg: string;
  userId?: string;
  userName?: string;
  clientHour?: number | string | null;
  greetingEnabled: boolean;
}

export interface GreetingPipelineResult {
  handled: boolean;
  response?: string;
}

export class GreetingPipeline {
  constructor(private readonly guard = GreetGuard) {}

  handle({
    messages,
    ultimaMsg,
    userId,
    userName,
    clientHour,
    greetingEnabled,
  }: GreetingPipelineParams): GreetingPipelineResult {
    if (!greetingEnabled) {
      return { handled: false };
    }

    const assistantCount = messages.filter(
      (m) => mapRoleForOpenAI(m.role) === "assistant"
    ).length;
    const threadVazia = assistantCount === 0;

    const ultima = (ultimaMsg || "").trim();
    const dentroDoLimite = ultima.length <= MAX_LEN_FOR_GREETING;
    const conteudoSubstantivo =
      /[?]|(\b(quero|preciso|como|por que|porque|ajuda|planejar|plano|passo|sinto|penso|lembro)\b)/i.test(
        ultima
      ) || ultima.split(/\s+/).length > 6;

    // Normaliza clientHour para number | undefined
    const normalizedHour: number | undefined =
      clientHour == null ? undefined : Number(clientHour);

    // Mantém apenas mensagens com role válido para SaudacaoMsg
    const saudaMsgs: SaudacaoMsg[] = [];
    for (const m of messages.slice(-4)) {
      const r = this.toSaudRole(m.role);
      if (r) {
        saudaMsgs.push({
          role: r,
          content: m.content || "",
        });
      }
    }

    const auto = respostaSaudacaoAutomatica({
      messages: saudaMsgs,
      userName,
      clientHour: normalizedHour,
    });

    // 👇 Early return: se não há auto, não tem o que saudar/despedir
    if (!auto) return { handled: false };

    if (auto.meta?.isFarewell) {
      return { handled: true, response: auto.text };
    }

    const isGreetingMeta = Boolean(
      auto.meta?.isGreeting || auto.meta?.contextualCue === "greeting"
    );

    if (
      isGreetingMeta &&
      threadVazia &&
      dentroDoLimite &&
      !conteudoSubstantivo &&
      this.guard.can(userId)
    ) {
      this.guard.mark(userId);
      return { handled: true, response: auto.text };
    }

    return { handled: false };
  }

  private toSaudRole(role: any): SaudacaoMsg["role"] | undefined {
    const mapped = mapRoleForOpenAI(role);
    if (mapped === "user" || mapped === "assistant" || mapped === "system") {
      return mapped;
    }
    return undefined;
  }
}

export const defaultGreetingPipeline = new GreetingPipeline();
