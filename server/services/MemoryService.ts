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
import { log } from "./promptContext/logger";

export interface SaveMemoryOutcome {
  memoryId?: string | null;
}

const KNOWN_EMOTIONS: Record<string, string> = {
  alegria: "Alegria",
  tristeza: "Tristeza",
  raiva: "Raiva",
  medo: "Medo",
  nojo: "Nojo",
  surpresa: "Surpresa",
  calma: "Calma",
  neutra: "Neutro",
  neutro: "Neutro",
};

const DOMAIN_ALIASES: Record<string, string> = {
  trabalho: "trabalho",
  profissional: "trabalho",
  carreira: "trabalho",
  estudos: "estudos",
  estudo: "estudos",
  aprendizagem: "estudos",
  relacionamentos: "relacionamentos",
  relacionamento: "relacionamentos",
  familia: "familia",
  familiar: "familia",
  amizades: "relacionamentos",
  amizade: "relacionamentos",
  saude: "saude",
  saude_mental: "saude_mental",
  saude_fisica: "saude",
  autocuidado: "autocuidado",
  auto_cuidado: "autocuidado",
  autoamor: "autoestima",
  auto_estima: "autoestima",
  autoestima: "autoestima",
  espiritualidade: "espiritualidade",
  finanças: "financeiro",
  financeiro: "financeiro",
  dinheiro: "financeiro",
  lazer: "lazer",
  proposito: "proposito",
  proposito_de_vida: "proposito",
  trabalho_profissional: "trabalho",
  carreira_profissional: "trabalho",
  comunidade: "comunidade",
  bem_estar: "saude",
};

const VALID_DOMAINS = new Set<string>([
  "trabalho",
  "relacionamentos",
  "familia",
  "saude",
  "saude_mental",
  "financeiro",
  "espiritualidade",
  "autocuidado",
  "autoestima",
  "estudos",
  "lazer",
  "proposito",
  "comunidade",
  "bem_estar",
  "outros",
]);

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
}

function sanitizeTagsInput(raw: unknown): string[] {
  if (!raw) return [];
  let values: unknown[] = [];
  if (Array.isArray(raw)) {
    values = raw;
  } else if (raw instanceof Set) {
    values = Array.from(raw.values());
  } else if (typeof raw === "string") {
    values = raw.split(/[;,\n]/);
  } else {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function resolveEmotion(primary: unknown, tags: string[]): string {
  if (typeof primary === "string") {
    const trimmed = primary.trim();
    const normalized = normalizeToken(trimmed);
    if (normalized && KNOWN_EMOTIONS[normalized]) {
      return KNOWN_EMOTIONS[normalized];
    }
    if (normalized !== "indefinida") {
      return trimmed;
    }
  }

  for (const tag of tags) {
    const key = normalizeToken(tag);
    if (key && KNOWN_EMOTIONS[key]) {
      return KNOWN_EMOTIONS[key];
    }
  }

  return "Neutro";
}

function normalizeDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeToken(trimmed);
  if (!normalized) return null;
  const mapped = DOMAIN_ALIASES[normalized] ?? normalized;
  if (VALID_DOMAINS.has(mapped)) {
    return mapped;
  }
  return "outros";
}

function coerceNivelAbertura(value: unknown, fallback: number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(3, Math.round(value)));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(3, Math.round(parsed)));
    }
  }
  return fallback;
}

function coerceIntensity(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(10, Math.round(parsed)));
  }
  return fallback;
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

  const blocoTags = sanitizeTagsInput(bloco?.tags);
  const emocaoPrincipal = resolveEmotion(bloco?.emocao_principal, blocoTags);
  const intensidadeNum = coerceIntensity(bloco?.intensidade, Math.max(0, Math.round(decision.intensity)));
  const nivelNumerico = coerceNivelAbertura(bloco?.nivel_abertura, decision.openness ?? null);
  const shouldSaveMemory = decision.saveMemory && intensidadeNum >= 7;
  const shouldSaveReference = !shouldSaveMemory && intensidadeNum > 0;
  const dominioPadronizado = normalizeDomain(bloco?.dominio_vida);
  const analiseResumo = analiseResumoSafe || null;

  const payloadBase = {
    usuario_id: userId,
    mensagem_id: lastMessageId ?? null,
    resumo_eco: bloco?.analise_resumo ?? cleaned,
    emocao_principal: emocaoPrincipal,
    intensidade: intensidadeNum,
    contexto: ultimaMsg,
    dominio_vida: dominioPadronizado,
    padrao_comportamental: bloco?.padrao_comportamental ?? null,
    nivel_abertura: nivelNumerico,
    categoria: bloco?.categoria ?? null,
    analise_resumo: analiseResumo,
    tags: blocoTags,
    embedding: embeddingFinal,
    referencia_anterior_id: referenciaAnteriorId,
  };

  let savedMemoryId: string | null = null;
  if (Number.isFinite(intensidadeNum) && intensidadeNum > 0) {
    const logPreview = {
      usuario_id: payloadBase.usuario_id,
      mensagem_id: payloadBase.mensagem_id,
      salvar_memoria: shouldSaveMemory,
      intensidade: payloadBase.intensidade,
      emocao_principal: payloadBase.emocao_principal,
      dominio_vida: payloadBase.dominio_vida,
      tags: payloadBase.tags,
    };
    log.info("memory.persistence.payload", logPreview);

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
