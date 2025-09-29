import { mapRoleForOpenAI, type ChatMessage } from "../../utils";
import { derivarNivel, detectarSaudacaoBreve } from "../promptContext/Selector";
import { heuristicaPreViva, isLowComplexity } from "./helpers";

export interface RouteDecisionParams {
  messages: ChatMessage[];
  ultimaMsg: string;
  forcarMetodoViva?: boolean;
  promptOverride?: string | null;
}

export interface RouteDecision {
  mode: "fast" | "full";
  hasAssistantBefore: boolean;
  vivaAtivo: boolean;
  lowComplexity: boolean;
  nivelRoteador: number | null;
  forceFull: boolean;
}

export class ConversationRouter {
  decide({
    messages,
    ultimaMsg,
    forcarMetodoViva,
    promptOverride,
  }: RouteDecisionParams): RouteDecision {
    const saudacaoBreve = detectarSaudacaoBreve(ultimaMsg);
    const nivelRoteador = derivarNivel(ultimaMsg, saudacaoBreve);
    const lowComplexity = isLowComplexity(ultimaMsg);
    const vivaAtivo = Boolean(forcarMetodoViva || heuristicaPreViva(ultimaMsg));

    const forceFull = Boolean(promptOverride && promptOverride.trim().length > 0);

    const hasAssistantBefore =
      messages.filter((m) => mapRoleForOpenAI(m.role) === "assistant").length > 0;

    const canFastLane =
      !forceFull &&
      lowComplexity &&
      !vivaAtivo &&
      (typeof nivelRoteador === "number" ? nivelRoteador <= 1 : true);

    return {
      mode: canFastLane ? "fast" : "full",
      hasAssistantBefore,
      vivaAtivo,
      lowComplexity,
      nivelRoteador: typeof nivelRoteador === "number" ? nivelRoteador : null,
      forceFull,
    };
  }
}

export const defaultConversationRouter = new ConversationRouter();
