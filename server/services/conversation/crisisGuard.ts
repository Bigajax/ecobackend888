/**
 * crisisGuard.ts — Gate determinístico de crise aguda (Onda 1A).
 *
 * Quando a mensagem traz sinal de crise aguda (ideação/autolesão), a Eco NÃO deve depender da
 * obediência do LLM ao SAFETY_PROTOCOL: devolvemos uma resposta de segurança fixa
 * (`CRISIS_RESPONSE`) sem chamar o modelo e sem sugerir ações. O ponto de interceptação é
 * `handlePreLLMShortcuts` (antes do greeting/fastLane/LLM).
 *
 * Critério deliberadamente ESTREITO — usa apenas `flags.ideacao` (regex de suicídio/autolesão em
 * `promptContext/flags.ts`), não os sinais "amarelos" (desespero/vazio), para não bloquear conversas
 * legítimas de tristeza/cansaço. Os sinais amarelos seguem tratados pelo SAFETY_PROTOCOL no prompt.
 */
import { CRISIS_RESPONSE } from "../../core/promptIdentity";

export { CRISIS_RESPONSE };

type CrisisFlags = { ideacao?: boolean | null } | null | undefined;

/** True quando há sinal de crise AGUDA (ideação/autolesão). */
export function isAcuteCrisis(
  ecoDecision: { flags?: CrisisFlags } | null | undefined
): boolean {
  return Boolean(ecoDecision?.flags?.ideacao);
}
