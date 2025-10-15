import { loadConversationContext } from "./derivadosLoader";
import { defaultContextCache } from "./contextCache";
import type { EcoDecisionResult } from "./ecoDecisionHub";
import type { ActivationTracer } from "../../core/activationTracer";
import type { RetrieveMode } from "../supabase/memoriaRepository";

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
  retrieveMode?: RetrieveMode;
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
  retrieveMode,
}: PrepareContextParams): Promise<PreparedContext> {
  const effectiveUserId = supabase && !isGuest ? userId : undefined;
  const context = await loadConversationContext(effectiveUserId, ultimaMsg, supabase, {
    promptOverride,
    metaFromBuilder,
    onDerivadosError,
    activationTracer,
    retrieveMode,
  });

  const memsSemelhantesList = Array.isArray(context.memsSemelhantes)
    ? context.memsSemelhantes
    : [];
  const hasMemories = memsSemelhantesList.length > 0;
  const flagBag = (decision.flags = decision.flags ?? ({} as EcoDecisionResult["flags"]));
  flagBag.useMemories = hasMemories;

  const tagCounter = new Map<string, number>();
  for (const memoria of memsSemelhantesList) {
    const rawTags = Array.isArray(memoria?.tags) ? memoria.tags : [];
    for (const tag of rawTags) {
      const normalized = typeof tag === "string" ? tag.trim().toLowerCase() : "";
      if (!normalized) continue;
      tagCounter.set(normalized, (tagCounter.get(normalized) ?? 0) + 1);
    }
  }
  const hasConvergentTags = Array.from(tagCounter.values()).some((count) => count >= 2);
  flagBag.patternSynthesis =
    hasConvergentTags && decision.intensity >= 5 && decision.openness >= 2 ? true : false;

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
