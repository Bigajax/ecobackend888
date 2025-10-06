import { loadConversationContext } from "./derivadosLoader";
import { defaultContextCache } from "./contextCache";

interface PrepareContextParams {
  userId: string;
  ultimaMsg: string;
  supabase: any;
  promptOverride?: string;
  metaFromBuilder?: any;
  mems: any[];
  userName?: string | null;
  forcarMetodoViva: boolean;
  blocoTecnicoForcado: any;
  decision: { vivaAtivo: boolean };
  onDerivadosError?: (error: unknown) => void;
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
}: PrepareContextParams): Promise<PreparedContext> {
  const context = await loadConversationContext(userId, ultimaMsg, supabase, {
    promptOverride,
    metaFromBuilder,
    onDerivadosError,
  });

  const systemPrompt =
    promptOverride ??
    (await defaultContextCache.build({
      userId,
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
