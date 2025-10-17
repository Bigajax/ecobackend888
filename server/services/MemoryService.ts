import type { AnySupabase } from "../adapters/SupabaseAdapter";
import { getEmbeddingCached } from "../adapters/EmbeddingAdapter";
import { updateEmotionalProfile } from "./updateEmotionalProfile"; // seu arquivo
import {
  salvarReferenciaTemporaria,
  type ReferenciaPayload,
} from "./referenciasService"; // seu arquivo
import { invalidateResponseCacheForUser } from "./CacheService";
import {
  trackMemoriaRegistrada,
  trackReferenciaEmocional,
  trackPerguntaProfunda,
} from "../analytics/events/mixpanelEvents"; // seu arquivo
import type { EcoDecisionResult } from "./conversation/ecoDecisionHub";

export interface SaveMemoryOutcome {
  memoryId?: string | null;
}

export async function saveMemoryOrReference(opts: {
  supabase: AnySupabase;
  userId: string;
  lastMessageId?: string | null;
  cleaned: string;
  bloco: any | null;
  ultimaMsg: string;
  decision: EcoDecisionResult;
}): Promise<SaveMemoryOutcome | void> {
  const { supabase, userId, lastMessageId, cleaned, bloco, ultimaMsg, decision } = opts;

  const analiseResumoSafe =
    typeof bloco?.analise_resumo === "string" ? bloco.analise_resumo.trim() : "";

  let textoParaEmbedding = [cleaned, analiseResumoSafe].filter(Boolean).join("\n").trim();
  if (!textoParaEmbedding || textoParaEmbedding.length < 3) textoParaEmbedding = "PLACEHOLDER EMBEDDING";
  else textoParaEmbedding = textoParaEmbedding.slice(0, 8000);

  const embeddingFinal = await getEmbeddingCached(textoParaEmbedding, "memoria ou referencia");

  let referenciaAnteriorId: string | null = null;
  const { data: ultimaMemoria } = await supabase
    .from("memories")
    .select("id")
    .eq("usuario_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // @ts-ignore
  referenciaAnteriorId = (ultimaMemoria as any)?.id ?? null;

  const intensidadeNum = Math.max(0, Math.round(decision.intensity));
  const nivelNumerico = decision.openness ?? null;
  const shouldSaveMemory = decision.saveMemory && intensidadeNum >= 7;
  const shouldSaveReference = !shouldSaveMemory && intensidadeNum > 0;

  const payloadBase = {
    usuario_id: userId,
    mensagem_id: lastMessageId ?? null,
    resumo_eco: bloco?.analise_resumo ?? cleaned,
    emocao_principal: bloco?.emocao_principal || "indefinida",
    intensidade: intensidadeNum,
    contexto: ultimaMsg,
    dominio_vida: bloco?.dominio_vida ?? null,
    padrao_comportamental: bloco?.padrao_comportamental ?? null,
    nivel_abertura: nivelNumerico,
    categoria: bloco?.categoria ?? null,
    analise_resumo: bloco?.analise_resumo ?? null,
    tags: Array.isArray(bloco?.tags) ? bloco!.tags : [],
    embedding: embeddingFinal,
    referencia_anterior_id: referenciaAnteriorId,
  };

  let savedMemoryId: string | null = null;
  if (Number.isFinite(intensidadeNum) && intensidadeNum > 0) {
    if (shouldSaveMemory) {
      const { data, error } = await supabase
        .from("memories")
        .insert([{ ...payloadBase, salvar_memoria: true, created_at: new Date().toISOString() }])
        .select("id")
        .maybeSingle();
      if (!error) {
        const insertedId =
          data && typeof (data as any)?.id === "string" && (data as any).id.trim().length
            ? (data as any).id.trim()
            : null;
        savedMemoryId = insertedId;
        try { await updateEmotionalProfile(userId); } catch {}
        invalidateResponseCacheForUser(userId);
      }
      trackMemoriaRegistrada({
        userId,
        intensidade: intensidadeNum,
        emocao: payloadBase.emocao_principal,
        dominioVida: payloadBase.dominio_vida,
        categoria: payloadBase.categoria,
      });
    } else if (shouldSaveReference) {
      await salvarReferenciaTemporaria(payloadBase as ReferenciaPayload);
      trackReferenciaEmocional({
        userId,
        intensidade: intensidadeNum,
        emocao: payloadBase.emocao_principal,
        tags: payloadBase.tags,
        categoria: payloadBase.categoria,
      });
    }
    if (nivelNumerico === 3) {
      trackPerguntaProfunda({
        userId,
        emocao: payloadBase.emocao_principal,
        intensidade: intensidadeNum,
        categoria: payloadBase.categoria,
        dominioVida: payloadBase.dominio_vida,
      });
    }
  }

  if (savedMemoryId) {
    return { memoryId: savedMemoryId };
  }
}
