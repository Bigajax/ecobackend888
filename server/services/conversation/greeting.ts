import { mapRoleForOpenAI } from "../../utils";
import { GreetGuard } from "../../core/policies/GreetGuard";
import {
  respostaSaudacaoAutomatica,
  type Msg as SaudacaoMsg,
} from "../../utils/respostaSaudacaoAutomatica";

export interface GreetingPipelineParams {
  messages: Array<{ role: any; content: string }>;
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
    const saudacaoCurta = /^\s*(oi|olá|ola|bom dia|boa tarde|boa noite)\s*[!.?]*$/i.test(
      ultima
    );
    const conteudoSubstantivo =
      /[?]|(\b(quero|preciso|como|por que|porque|ajuda|planejar|plano|passo|sinto|penso|lembro)\b)/i.test(
        ultima
      ) || ultima.split(/\s+/).length > 6;

    const saudaMsgs: SaudacaoMsg[] = messages.slice(-4).map((m) => ({
      role: this.toSaudRole(m.role),
      content: m.content || "",
    }));

    const auto = respostaSaudacaoAutomatica({
      messages: saudaMsgs,
      userName,
      clientHour,
    });

    if (auto?.meta?.isFarewell) {
      return { handled: true, response: auto.text };
    }

    if (
      auto?.meta?.isGreeting &&
      threadVazia &&
      (saudacaoCurta || ultima.length === 0) &&
      !conteudoSubstantivo &&
      this.guard.can(userId)
    ) {
      this.guard.mark(userId);
      return { handled: true, response: auto.text };
    }

    return { handled: false };
  }

  private toSaudRole(role: any): SaudacaoMsg["role"] {
    const mapped = mapRoleForOpenAI(role);
    if (mapped === "user" || mapped === "assistant" || mapped === "system") {
      return mapped;
    }
    return undefined;
  }
}

export const defaultGreetingPipeline = new GreetingPipeline();
