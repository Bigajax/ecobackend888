import { mapRoleForOpenAI, type ChatMessage } from "../../utils";
import { GreetGuard } from "../../core/policies/GreetGuard";
import {
  respostaSaudacaoAutomatica,
  MAX_LEN_FOR_GREETING,
  type Msg as SaudacaoMsg,
} from "../../utils/respostaSaudacaoAutomatica";
import { fetchTemaRecenteMarcante } from "./greetingMemory";

export interface GreetingPipelineParams {
  messages: ChatMessage[];
  ultimaMsg: string;
  userId?: string;
  userName?: string;
  clientHour?: number | string | null;
  greetingEnabled: boolean;
  /** Cliente Supabase (admin) para puxar memória recente na abertura. */
  supabase?: any;
  /** Convidados não têm memória persistente → abertura neutra. */
  isGuest?: boolean;
}

export interface GreetingPipelineResult {
  handled: boolean;
  response?: string;
}

export class GreetingPipeline {
  constructor(private readonly guard = GreetGuard) {}

  async handle({
    messages,
    ultimaMsg,
    userId,
    userName,
    clientHour,
    greetingEnabled,
    supabase,
    isGuest = false,
  }: GreetingPipelineParams): Promise<GreetingPipelineResult> {
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

      let response = auto.text;

      // Abertura que "lembra como uma pessoa": só no 1º turno, usuário autenticado,
      // e quando houver memória recente marcante (≥7). Qualquer falha → saudação neutra.
      if (auto.meta?.firstTurn && !isGuest && supabase) {
        const tema = await fetchTemaRecenteMarcante(supabase, userId);
        if (tema) {
          const comMemoria = respostaSaudacaoAutomatica({
            messages: saudaMsgs,
            userName,
            clientHour: normalizedHour,
            memoryTheme: tema,
          });
          if (comMemoria?.text) response = comMemoria.text;
        }
      }

      return { handled: true, response };
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
