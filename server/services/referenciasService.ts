// services/referenciasService.ts
import { supabase } from "../lib/supabaseAdmin"; // ✅ instância singleton
import { unitNorm } from "../adapters/embeddingService";

interface BlocoTecnicoBase {
  usuario_id: string;
  mensagem_id?: string | null;
  referencia_anterior_id?: string | null;
  resumo_eco: string;
  emocao_principal: string;
  intensidade: number;              // 0..10 recomendado
  contexto: string;
  dominio_vida?: string | null;
  padrao_comportamental?: string | null;
  nivel_abertura?: number | null;
  analise_resumo?: string | null;
  categoria?: string | null;
  tags?: string[] | null;
}

export interface ReferenciaPayload extends BlocoTecnicoBase {
  embedding?: number[] | null;      // opcional
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

function sanitizeTags(tags?: string[] | null): string[] | null {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const cleaned = Array.from(
    new Set(
      tags
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
    )
  );
  return cleaned.slice(0, 16);
}

function sanitizeTexto(s: string, cap = 8000): string {
  return (s || "").toString().trim().replace(/\s+/g, " ").slice(0, cap);
}

function orNull<T>(v: T | undefined | null): T | null {
  return v == null ? null : (v as T);
}

/** Converte unknown[]/string JSON em number[] seguro, ou null se inválido */
function toNumberArray(arr: unknown): number[] | null {
  if (arr == null) return null;
  let raw: unknown;
  try {
    raw = Array.isArray(arr) ? arr : JSON.parse(String(arr));
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const nums = (raw as unknown[]).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  return nums.length > 0 ? nums : null;
}

/**
 * Salva referência temporária com campos técnicos completos.
 * - Não seta created_at no client (usa DEFAULT do banco).
 * - Normaliza embedding (se vier) e remove se vazio.
 */
export async function salvarReferenciaTemporaria(bloco: ReferenciaPayload) {
  try {
    if (!bloco?.usuario_id) throw new Error("usuario_id ausente");
    if (!bloco?.resumo_eco) throw new Error("resumo_eco ausente");
    if (!bloco?.contexto) throw new Error("contexto ausente");
    if (typeof bloco.intensidade !== "number") throw new Error("intensidade ausente");

    // normalizações & sanitização
    const payload: Record<string, any> = {
      usuario_id: bloco.usuario_id,
      mensagem_id: orNull(bloco.mensagem_id),
      referencia_anterior_id: orNull(bloco.referencia_anterior_id),
      resumo_eco: sanitizeTexto(bloco.resumo_eco, 4000),
      emocao_principal: sanitizeTexto(bloco.emocao_principal, 128),
      intensidade: clamp(Number(bloco.intensidade) || 0, 0, 10),
      contexto: sanitizeTexto(bloco.contexto, 8000),
      dominio_vida: orNull(bloco.dominio_vida?.trim?.() || bloco.dominio_vida || null),
      padrao_comportamental: orNull(bloco.padrao_comportamental?.trim?.() || bloco.padrao_comportamental || null),
      nivel_abertura: typeof bloco.nivel_abertura === "number" ? bloco.nivel_abertura : null,
      analise_resumo: orNull(bloco.analise_resumo?.trim?.() || bloco.analise_resumo || null),
      categoria: orNull(bloco.categoria?.trim?.() || bloco.categoria || null),
      tags: sanitizeTags(bloco.tags),
      salvar_memoria: false, // referência temporária por definição
    };

    // embedding: normaliza se vier e tem conteúdo; remove se vazio
    if (bloco.embedding != null) {
      const coerced = toNumberArray(bloco.embedding);
      if (coerced && coerced.length > 0) {
        payload.embedding = unitNorm(coerced); // number[] normalizado
      }
    }

    const { data, error } = await supabase
      .from("referencias_temporarias")
      .insert([payload])
      .select("id, created_at")
      .single();

    if (error) {
      console.error("❌ Erro ao salvar referência temporária:", {
        message: error.message,
        details: (error as any)?.details ?? null,
        hint: (error as any)?.hint ?? null,
        payloadPreview: {
          usuario_id: payload.usuario_id,
          temEmbedding: Array.isArray(payload.embedding),
          referencia_anterior_id: payload.referencia_anterior_id,
        },
      });
      throw error;
    }

    console.log("✅ Referência temporária salva:", {
      id: (data as any)?.id,
      created_at: (data as any)?.created_at,
    });
    return data;
  } catch (err) {
    console.error(
      "❌ Erro inesperado em salvarReferenciaTemporaria:",
      (err as Error).message
    );
    throw err;
  }
}
