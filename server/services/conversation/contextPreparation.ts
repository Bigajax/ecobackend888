import { loadConversationContext } from "./derivadosLoader";
import { defaultContextCache } from "./contextCache";
import type { EcoDecisionResult } from "./ecoDecisionHub";
import type { ActivationTracer } from "../../core/activationTracer";

interface PrepareContextParams {
  userId?: string;
  ultimaMsg: string;
  supabase?: any;
  promptOverride?: string;
  metaFromBuilder?: any;
  mems: any[];
  userName?: string | null;
  forcarMetodoViva: boolean;
  blocoTecnicoForcado: any;
  decision: EcoDecisionResult;
  onDerivadosError?: (error: unknown) => void;
  cacheUserId?: string;
  isGuest?: boolean;
  activationTracer?: ActivationTracer;
}

export interface PreparedContext {
  systemPrompt: string;
  context: Awaited<ReturnType<typeof loadConversationContext>>;
}

export async function prepareConversationContext({
  userId,
  ultimaMsg,
  supabase,
  promptOverride,
  metaFromBuilder,
  mems,
  userName,
  forcarMetodoViva,
  blocoTecnicoForcado,
  decision,
  onDerivadosError,
  cacheUserId,
  isGuest,
  activationTracer,
}: PrepareContextParams): Promise<PreparedContext> {
  const effectiveUserId = supabase && !isGuest ? userId : undefined;
  const context = await loadConversationContext(effectiveUserId, ultimaMsg, supabase, {
    promptOverride,
    metaFromBuilder,
    onDerivadosError,
    activationTracer,
  });

  const systemPrompt =
    promptOverride ??
    (await defaultContextCache.build({
      userId: cacheUserId ?? userId,
      userName: userName ?? undefined,
      perfil: null,
      mems,
      memoriasSemelhantes: context.memsSemelhantes,
      forcarMetodoViva: decision.vivaSteps.length > 0,
      blocoTecnicoForcado,
      texto: ultimaMsg,
      heuristicas: context.heuristicas,
      userEmbedding: context.userEmbedding,
      skipSaudacao: true,
      derivados: context.derivados,
      aberturaHibrida: context.aberturaHibrida,
      decision,
      activationTracer,
    }));

  return { systemPrompt, context };
}
