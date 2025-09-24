// server/services/promptContext/Signals.ts

// ---------------------- Tipos leves ----------------------
type PerfilSlim = {
  emocoes_frequentes?: Record<string, number>;
  temas_recorrentes?: Record<string, number>;
  ultima_interacao_significativa?: string | null;
  resumo_geral_ia?: string | null;
};

type MemResumo = {
  intensidade?: number | null;
  similaridade?: number | null;
  tags?: string[] | null;
  emocao_principal?: string | null;
};

type TemaDerivado = {
  tema?: string;
  tag?: string;
  tema_nome?: string;
  tendencia?: string | null;
  freq_30d?: number | null;
  freq30?: number | null;
  freq_90d?: number | null;
  freq90?: number | null;
};

type MarcoDerivado = {
  tema?: string;
  tag?: string;
  resumo?: string;
  resumo_evolucao?: string;
  marco_at?: string | number | Date | null;
};

type DerivadosSlim = {
  top_temas_30d?: TemaDerivado[];
  marcos?: MarcoDerivado[];
  dica_estilo?: string | null;
  heuristica_interacao?: { abriu?: number; fechou?: number; neutro?: number } | null;
};

// ---------------------- helpers de texto/estado ----------------------

export function construirStateSummary(perfil: PerfilSlim | undefined, nivel: number): string {
  if (!perfil) return "";
  const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(", ") || "nenhuma";
  const temas   = Object.keys(perfil.temas_recorrentes || {}).join(", ") || "nenhum";
  const abertura = nivel === 1 ? "superficial" : nivel === 2 ? "reflexiva" : "profunda";
  const resumo  = perfil.resumo_geral_ia?.trim() || "sem resumo geral registrado";
  const ultima  = perfil.ultima_interacao_significativa ?? "nenhuma";
  return `\n🗺️ Estado Emocional Consolidado:
- Emoções frequentes: ${emocoes}
- Temas recorrentes: ${temas}
- Nível de abertura estimado: ${abertura}
- Última interação significativa: ${ultima}
- Resumo geral: ${resumo}`.trim();
}

export function construirNarrativaMemorias(mems: MemResumo[]): string {
  if (!mems?.length) return "";
  const ord = [...mems]
    .sort(
      (a, b) =>
        (b.intensidade ?? 0) - (a.intensidade ?? 0) ||
        (b.similaridade ?? 0) - (a.similaridade ?? 0),
    )
    .slice(0, 2);

  const temas = new Set<string>();
  const emocoes = new Set<string>();

  for (const m of ord) {
    (m.tags ?? []).slice(0, 3).forEach((t) => t && temas.add(t));
    if (m.emocao_principal) emocoes.add(m.emocao_principal);
  }

  const temasTxt = Array.from(temas).slice(0, 3).join(", ") || "—";
  const emocoesTxt = Array.from(emocoes).slice(0, 2).join(", ") || "—";

  return `\n📜 Continuidade: temas (${temasTxt}) e emoções (${emocoesTxt}); use só se fizer sentido agora.`;
}

function fmtData(d: string | number | Date | null | undefined): string | null {
  if (d == null) return null;
  const dt = new Date(d);
  return isNaN(+dt) ? null : dt.toLocaleDateString();
}

export function renderDerivados(der: DerivadosSlim | undefined, aberturaHibrida?: string | null) {
  if (!der) return "";

  const temas: TemaDerivado[] = Array.isArray(der?.top_temas_30d) ? der!.top_temas_30d! : [];
  const marcos: MarcoDerivado[] = Array.isArray(der?.marcos) ? der!.marcos! : [];
  const dica: string | null = der?.dica_estilo ?? null;
  const eff = der?.heuristica_interacao ?? null;

  const topTemas = temas
    .slice(0, 3)
    .map((t) => {
      const nome = t?.tema ?? t?.tag ?? t?.tema_nome ?? "tema";
      const tend = t?.tendencia ?? null;
      const f30  = t?.freq_30d ?? t?.freq30 ?? null;
      const f90  = t?.freq_90d ?? t?.freq90 ?? null;
      return `• ${nome}${tend ? ` (${tend})` : ""}${f30 != null ? ` — 30d:${f30}${f90 != null ? ` / 90d:${f90}` : ""}` : ""}`;
    })
    .join("\n");

  const marcosTxt = marcos
    .slice(0, 3)
    .map((m) => {
      const tm = m?.tema ?? m?.tag ?? "—";
      const r  = m?.resumo ?? m?.resumo_evolucao ?? "";
      const at = fmtData(m?.marco_at);
      return `• ${tm}${at ? ` (${at})` : ""}: ${r}`;
    })
    .join("\n");

  const efeitos =
    eff ? `\nEfeitos últimas 10: abriu ${eff.abriu ?? 0} · fechou ${eff.fechou ?? 0} · neutro ${eff.neutro ?? 0}` : "";
  const dicaTxt     = dica ? `\nDica de estilo: ${dica}` : "";
  const aberturaTxt = aberturaHibrida ? `\nSugestão de abertura leve: ${aberturaHibrida}` : "";

  const partes: string[] = [];
  if (temas?.length)  partes.push(`🔁 Temas recorrentes (30d):\n${topTemas}`);
  if (marcos?.length) partes.push(`⏱️ Marcos recentes:\n${marcosTxt}`);
  if (efeitos)        partes.push(efeitos);
  if (dicaTxt)        partes.push(dicaTxt);
  if (aberturaTxt)    partes.push(aberturaTxt);

  if (!partes.length) return "";
  return `\n🧩 Sinais de contexto (derivados):\n${partes.join("\n")}`;
}

// ---------------------- guards estáticos (removidos) ----------------------

export async function loadStaticGuards(_modulosDir: string) {
  // Sem leitura de arquivos — retornos vazios e silenciosos.
  return {
    criterios: "",
    memoriaInstrucoes: "",
  };
}

// ---------------------- montagem de overhead ----------------------

export function buildOverhead({
  criterios,
  memoriaInstrucoes,
  responsePlanJson,
  instrucoesFinais,
  antiSaudacaoGuard,
}: {
  criterios?: string;
  memoriaInstrucoes?: string;
  responsePlanJson: string;
  instrucoesFinais: string;
  antiSaudacaoGuard: string;
}) {
  const blocks = [
    criterios ? `\n${criterios}` : "",
    memoriaInstrucoes ? `\n${memoriaInstrucoes}` : "",
    `\nRESPONSE_PLAN:${responsePlanJson}`,
    instrucoesFinais,
    `\n${antiSaudacaoGuard}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return blocks;
}
