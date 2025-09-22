import path from "path";
import fs from "fs/promises";

const cache = new Map<string, string>();
async function readOnce(p: string) {
  if (cache.has(p)) return cache.get(p)!;
  const c = (await fs.readFile(p, "utf-8")).trim();
  cache.set(p, c); return c;
}

export function construirStateSummary(perfil: any, nivel: number): string {
  if (!perfil) return "";
  const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(", ") || "nenhuma";
  const temas   = Object.keys(perfil.temas_recorrentes || {}).join(", ") || "nenhum";
  const abertura = nivel === 1 ? "superficial" : nivel === 2 ? "reflexiva" : "profunda";
  const resumo  = perfil.resumo_geral_ia || "sem resumo geral registrado";
  return `\n🗺️ Estado Emocional Consolidado:
- Emoções frequentes: ${emocoes}
- Temas recorrentes: ${temas}
- Nível de abertura estimado: ${abertura}
- Última interação significativa: ${perfil.ultima_interacao_significativa ?? "nenhuma"}
- Resumo geral: ${resumo}`.trim();
}

export function construirNarrativaMemorias(mems: any[]): string {
  if (!mems?.length) return "";
  const ord = [...mems].sort((a,b) =>
    (b.intensidade ?? 0) - (a.intensidade ?? 0) ||
    (b.similaridade ?? 0) - (a.similaridade ?? 0)
  ).slice(0,2);

  const temas = new Set<string>();
  const emocoes = new Set<string>();

  for (const m of ord) {
    (m.tags ?? []).slice(0,3).forEach((t: string) => temas.add(t));
    if (m.emocao_principal) emocoes.add(m.emocao_principal as string);
  }

  // evita spread em Set (compat com targets antigos)
  const temasTxt = Array.from(temas).slice(0,3).join(", ") || "—";
  const emocoesTxt = Array.from(emocoes).slice(0,2).join(", ") || "—";

  return `\n📜 Continuidade: temas (${temasTxt}) e emoções (${emocoesTxt}); use só se fizer sentido agora.`;
}

export function renderDerivados(der: any, aberturaHibrida?: string | null) {
  if (!der) return "";
  const temas: any[] = Array.isArray(der?.top_temas_30d) ? der.top_temas_30d : [];
  const marcos: any[] = Array.isArray(der?.marcos) ? der.marcos : [];
  const dica: string | null = der?.dica_estilo ?? null;
  const eff   = der?.heuristica_interacao ?? null;

  const topTemas = temas.slice(0,3).map((t: any) => {
    const nome = t?.tema ?? t?.tag ?? t?.tema_nome ?? "tema";
    const tend = t?.tendencia ?? null;
    const f30  = t?.freq_30d ?? t?.freq30 ?? null;
    const f90  = t?.freq_90d ?? t?.freq90 ?? null;
    return `• ${nome}${tend?` (${tend})`:""}${f30!=null?` — 30d:${f30}${f90!=null?` / 90d:${f90}`:""}`:""}`;
  }).join("\n");

  const marcosTxt = marcos.slice(0,3).map((m: any) => {
    const tm = m?.tema ?? m?.tag ?? "—";
    const r  = m?.resumo ?? m?.resumo_evolucao ?? "";
    const at = m?.marco_at ?? null;
    return `• ${tm}${at?` (${new Date(at).toLocaleDateString()})`:""}: ${r}`;
  }).join("\n");

  const efeitos =
    eff ? `\nEfeitos últimas 10: abriu ${eff.abriu ?? 0} · fechou ${eff.fechou ?? 0} · neutro ${eff.neutro ?? 0}` : "";
  const dicaTxt = dica ? `\nDica de estilo: ${dica}` : "";
  const aberturaTxt = aberturaHibrida ? `\nSugestão de abertura leve: ${aberturaHibrida}` : "";

  const partes: string[] = [];
  if (temas?.length) partes.push(`🔁 Temas recorrentes (30d):\n${topTemas}`);
  if (marcos?.length) partes.push(`⏱️ Marcos recentes:\n${marcosTxt}`);
  if (efeitos) partes.push(efeitos);
  if (dicaTxt) partes.push(dicaTxt);
  if (aberturaTxt) partes.push(aberturaTxt);

  if (!partes.length) return "";
  return `\n🧩 Sinais de contexto (derivados):\n${partes.join("\n")}`;
}

export async function loadStaticGuards(modulosDir: string) {
  const forbidden = await readOnce(path.join(modulosDir, "eco_forbidden_patterns.txt"));
  let criterios = ""; let memoriaInstrucoes = "";
  try { criterios = await readOnce(path.join(modulosDir, "eco_json_trigger_criteria.txt")); } catch {}
  try { memoriaInstrucoes = await readOnce(path.join(modulosDir, "MEMORIAS_NO_CONTEXTO.txt")); } catch {}
  return { forbidden, criterios, memoriaInstrucoes };
}

export function buildOverhead({
  criterios,
  memoriaInstrucoes,
  responsePlanJson,
  instrucoesFinais,
  antiSaudacaoGuard,
}:{
  criterios?: string; memoriaInstrucoes?: string; responsePlanJson: string;
  instrucoesFinais: string; antiSaudacaoGuard: string;
}) {
  const blocks = [
    criterios ? `\n${criterios}` : "",
    memoriaInstrucoes ? `\n${memoriaInstrucoes}` : "",
    `\nRESPONSE_PLAN:${responsePlanJson}`,
    instrucoesFinais,
    `\n${antiSaudacaoGuard}`.trim(),
  ].filter(Boolean);
  return blocks.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
