// services/updateEmotionalProfile.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { gerarResumoPerfilIA } from "./perfilResumoIA";

/** O retrato escrito pela IA é refeito no máximo uma vez por dia (custo). */
const INTERVALO_RETRATO_MS = 24 * 60 * 60 * 1000;

type Options = { supabase?: SupabaseClient };

function contar(lista: Array<string | null | undefined>): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const item of lista) {
    const chave = item?.trim().toLowerCase();
    if (chave) freq[chave] = (freq[chave] || 0) + 1;
  }
  return freq;
}

const topo = (freq: Record<string, number>, n = 3) =>
  Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);

function retratoSemIA(emocoes: Record<string, number>, temas: Record<string, number>): string {
  const e = topo(emocoes);
  const t = topo(temas);
  if (e.length && t.length) {
    return `Nas suas conversas mais fortes apareceram ${e.join(", ")}, quase sempre ligadas a ${t.join(", ")}.`;
  }
  if (e.length) return `Nas suas conversas mais fortes apareceram ${e.join(", ")}.`;
  return "Ainda há pouco para compor um retrato. Ele se forma com as conversas que marcam.";
}

/**
 * Atualiza perfis_emocionais a partir das memórias (intensidade >= 7).
 * As contagens se atualizam sempre; o texto da IA só quando não existe ou
 * tem mais de um dia (updated_at marca quando o retrato foi escrito).
 */
export async function updateEmotionalProfile(
  userId: string,
  options: Options = {}
): Promise<{ success: boolean; message: string }> {
  const supabase = options.supabase ?? ensureSupabaseConfigured();
  try {
    const [{ data, error }, { data: atual }] = await Promise.all([
      supabase
        .from("memories")
        .select("emocao_principal, dominio_vida, created_at")
        .eq("usuario_id", userId)
        .eq("salvar_memoria", true)
        .gte("intensidade", 7),
      supabase
        .from("perfis_emocionais")
        .select("resumo_geral_ia, updated_at")
        .eq("usuario_id", userId)
        .maybeSingle(),
    ]);

    if (error) {
      console.error("[perfil] erro ao buscar memórias:", error.message);
      return { success: false, message: "Erro ao buscar memórias" };
    }

    const memorias = data ?? [];
    if (memorias.length === 0) {
      return { success: false, message: "Nenhuma memória significativa ainda" };
    }

    const emocoes = contar(memorias.map((m) => m.emocao_principal));
    const temas = contar(memorias.map((m) => m.dominio_vida));
    const ultima = memorias.reduce<string | null>(
      (max, m) => (m.created_at && (!max || m.created_at > max) ? m.created_at : max),
      null
    );
    const contagens = { emocoes_frequentes: emocoes, temas_recorrentes: temas, ultima_interacao_sig: ultima };

    const retratoRecente =
      atual?.resumo_geral_ia &&
      atual.updated_at &&
      Date.now() - new Date(atual.updated_at).getTime() < INTERVALO_RETRATO_MS;

    if (retratoRecente) {
      const { error: e } = await supabase.from("perfis_emocionais").update(contagens).eq("usuario_id", userId);
      if (e) throw new Error(e.message);
      return { success: true, message: "Contagens atualizadas" };
    }

    const resumoIA = await gerarResumoPerfilIA({
      emocoesFreq: emocoes,
      temasFreq: temas,
      totalMemorias: memorias.length,
      ultimaInteracao: ultima,
    });

    const { error: e } = await supabase.from("perfis_emocionais").upsert(
      [
        {
          usuario_id: userId,
          ...contagens,
          resumo_geral_ia: resumoIA || retratoSemIA(emocoes, temas),
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "usuario_id" }
    );
    if (e) throw new Error(e.message);
    return { success: true, message: "Perfil emocional atualizado" };
  } catch (err: any) {
    console.error("[perfil] erro inesperado:", err?.message ?? err);
    return { success: false, message: "Erro ao atualizar perfil emocional" };
  }
}
