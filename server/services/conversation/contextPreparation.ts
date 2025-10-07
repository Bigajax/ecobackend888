import { loadConversationContext } from "./derivadosLoader";
import { defaultContextCache } from "./contextCache";

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
  decision: { vivaAtivo: boolean };
  onDerivadosError?: (error: unknown) => void;
  cacheUserId?: string;
  isGuest?: boolean;
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
}: PrepareContextParams): Promise<PreparedContext> {
  const effectiveUserId = supabase && !isGuest ? userId : undefined;
  const context = await loadConversationContext(effectiveUserId, ultimaMsg, supabase, {
    promptOverride,
    metaFromBuilder,
    onDerivadosError,
  });

  const systemPrompt =
    promptOverride ??
    (await defaultContextCache.build({
      userId: cacheUserId ?? userId,
      userName: userName ?? undefined,
      perfil: null,
      mems,
      memoriasSemelhantes: context.memsSemelhantes,
      forcarMetodoViva: decision.vivaAtivo,
      blocoTecnicoForcado,
      texto: ultimaMsg,
      heuristicas: context.heuristicas,
      userEmbedding: context.userEmbedding,
      skipSaudacao: true,
      derivados: context.derivados,
      aberturaHibrida: context.aberturaHibrida,
    }));

  return { systemPrompt, context };
}
