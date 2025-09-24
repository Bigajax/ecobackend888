// server/services/promptContext/Selector.ts
import { evalRule } from "../../utils/ruleEval";
import { heuristicasTriggerMap, tagsPorHeuristica } from "../../assets/config/heuristicasTriggers";
// ⚠️ removido: import { filosoficosTriggerMap } from "../../assets/config/filosoficosTriggers";
import { estoicosTriggerMap } from "../../assets/config/estoicosTriggers";
import { emocionaisTriggerMap } from "../../assets/config/emocionaisTriggers";
import { heuristicaNivelAbertura } from "../../utils/heuristicaNivelAbertura";
import { GREET_RE, HARD_CAP_EXTRAS, MAX_LEN_FOR_GREETING } from "../../utils/config";
import type { Memoria, Heuristica, NivelNum } from "../../utils/types";

const normalizar = (t: string) =>
  (t || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/* -------------------------------------
 * Matriz V2 helpers
 * ----------------------------------- */
export const isV2Matrix = (m: any) => !!m?.byNivelV2 && !!m?.baseModules;

export const resolveModulesForLevelV2 = (nivel: NivelNum, m: any): string[] => {
  const cfg = m.byNivelV2?.[nivel];
  if (!cfg) return [];
  const inherited = (cfg.inherits ?? []).flatMap((cat: string) => m.baseModules?.[cat] ?? []);
  return [...inherited, ...(cfg.specific ?? [])];
};

/* -------------------------------------
 * Ordenação por prioridade (limites.prioridade)
 * ----------------------------------- */
const orderByPrioridade = (nomes: string[], prioridade?: string[]) => {
  if (!prioridade?.length) return [...new Set(nomes)];
  const idx = new Map(prioridade.map((n, i) => [n, i]));
  return [...new Set(nomes)].sort((a, b) => {
    const ia = idx.has(a) ? (idx.get(a) as number) : Number.POSITIVE_INFINITY;
    const ib = idx.has(b) ? (idx.get(b) as number) : Number.POSITIVE_INFINITY;
    return ia - ib;
  });
};

/* -------------------------------------
 * Seleção base com gating (intensidade / regra)
 * ----------------------------------- */
export function selecionarModulosBase({
  nivel,
  intensidade,
  matriz,
  flags,
}: {
  nivel: NivelNum;
  intensidade: number;
  matriz: any;
  flags: { curiosidade?: boolean; duvida_classificacao?: boolean; pedido_pratico?: boolean };
}) {
  const arrays = () => {
    if (isV2Matrix(matriz)) {
      const level = matriz.byNivelV2?.[nivel];
      const inherited = level?.inherits?.flatMap((cat: string) => matriz.baseModules?.[cat] ?? []) ?? [];
      const specific = level?.specific ?? [];
      return { raw: [...inherited, ...specific], inherited, specific };
    }
    const raw = [...(matriz.alwaysInclude ?? []), ...(matriz.byNivel?.[nivel] ?? [])];
    return { raw, inherited: matriz.alwaysInclude ?? [], specific: matriz.byNivel?.[nivel] ?? [] };
  };

  const { raw, inherited, specific } = arrays();
  const dedup = [...new Set(raw)];
  const cortados: string[] = [];

  const posGating = dedup.filter((arquivo) => {
    if (!arquivo?.trim()) return false;

    const min = matriz.intensidadeMinima?.[arquivo];
    if (typeof min === "number" && intensidade < min) {
      cortados.push(`${arquivo} [min=${min}]`);
      return false;
    }

    const cond = matriz.condicoesEspeciais?.[arquivo];
    if (!cond) return true;

    const ok = evalRule(cond.regra, { nivel, intensidade, ...flags });
    if (!ok) cortados.push(`${arquivo} [regra=${cond.regra}]`);
    return ok;
  });

  // ✅ aplica prioridade definida na matriz
  const priorizado = orderByPrioridade(posGating, matriz?.limites?.prioridade);

  return {
    selecionados: priorizado,
    debug: { raw: dedup, inherited, specific, posGating, cortadosPorRegraOuIntensidade: cortados },
  };
}

/* -------------------------------------
 * Sinais simples
 * ----------------------------------- */
export function detectarSaudacaoBreve(t: string) {
  const s = normalizar(t);
  return s.length > 0 && s.length <= MAX_LEN_FOR_GREETING && GREET_RE.test(s);
}

export function derivarNivel(entrada: string, saudacaoBreve: boolean): NivelNum {
  let n: any = heuristicaNivelAbertura(entrada) || 1;
  if (typeof n === "string") {
    const s = n.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    n = s === "baixo" ? 1 : s === "medio" ? 2 : 3;
  }
  if (saudacaoBreve) n = 1;
  if (n < 1 || n > 3) n = 1;
  return n as NivelNum;
}

export function derivarFlags(entrada: string) {
  const curiosidade = /\b(por que|porque|pq|explica|explic(a|ar)|entender|entende|curios)\b/i.test(entrada);
  const pedido_pratico =
    /\b(o que faço|o que eu faço|como faço|como falo|pode ajudar|tem (ideia|dica)|me ajuda|ajuda com|sugest(ão|oes))\b/i.test(
      entrada,
    );
  return { curiosidade, pedido_pratico, duvida_classificacao: false };
}

/* -------------------------------------
 * Faixas por módulo (alinhadas à matriz)
 * ----------------------------------- */

// Estoicos / filosóficos
const faixaEstoicos: Record<string, [number, number]> = {
  "eco_corpo_emocao.txt": [3, 7],
  "eco_fim_do_sofrimento.txt": [3, 7],
  "eco_identificacao_mente.txt": [3, 6],
  "eco_observador_presente.txt": [3, 6],
  "eco_presenca_racional.txt": [3, 6],
};

// Cognitivos
const faixaCognitivos: Record<string, [number, number]> = {
  "eco_heuristica_ancoragem.txt": [3, 6],
  "eco_heuristica_causas_superam_estatisticas.txt": [3, 6],
  "eco_heuristica_certeza_emocional.txt": [4, 7],
  "eco_heuristica_disponibilidade.txt": [2, 6],
  "eco_heuristica_excesso_confianca.txt": [3, 6],
  "eco_heuristica_ilusao_validade.txt": [3, 6],
  "eco_heuristica_intuicao_especialista.txt": [3, 6],
  "eco_heuristica_regressao_media.txt": [2, 6],
  "eco_heuristica_ilusao_compreensao_passado.txt": [3, 6],
};
const defaultFaixaCognitivo: [number, number] = [3, 6];

const dentroFaixa = (arquivo: string, intensidade: number, mapa: Record<string, [number, number]>, fallback?: [number, number]) => {
  const [minI, maxI] = mapa[arquivo] ?? fallback ?? [3, 6];
  return intensidade >= minI && intensidade <= maxI;
};

/* -------------------------------------
 * Extras rankeados com cooldown (1 por resposta)
 * Prioridade: emocional > cognitivo > filosofico
 * Evitar opcionais em crise (≥8), exceto emocionais se houver
 * ----------------------------------- */
type Cat = "emocional" | "cognitivo" | "filosofico";
type ExtraCand = { arquivo: string; cat: Cat; score: number };

const lastTriggeredByUser = new Map<string, Record<string, number>>();

const inCooldown = (uid?: string, arq?: string, secs = 900) => {
  if (!uid || !arq) return false;
  const rec = lastTriggeredByUser.get(uid) ?? {};
  const last = rec[arq] ?? 0;
  return Date.now() / 1000 - last < secs;
};

const mark = (uid?: string, arqs: string[] = []) => {
  if (!uid) return;
  const rec = lastTriggeredByUser.get(uid) ?? {};
  const now = Math.floor(Date.now() / 1000);
  for (const a of arqs) rec[a] = now;
  lastTriggeredByUser.set(uid, rec);
};

export function selecionarExtras({
  userId,
  entrada,
  nivel,
  intensidade,
  memsUsadas,
  heuristicaAtiva,
  heuristicasEmbedding,
}: {
  userId?: string;
  entrada: string;
  nivel: NivelNum;
  intensidade: number;
  memsUsadas?: Memoria[];
  heuristicaAtiva?: Heuristica;
  heuristicasEmbedding?: any[];
}) {
  const txt = normalizar(entrada);
  const { pedido_pratico } = derivarFlags(entrada); // 👈 gating para cognitivo/estoico

  const cands: ExtraCand[] = [];
  const push = (x: ExtraCand) => {
    const i = cands.findIndex((c) => c.arquivo === x.arquivo);
    if (i >= 0) {
      if (x.score > cands[i].score) cands[i] = x;
    } else {
      cands.push(x);
    }
  };

  const emCrise = intensidade >= 8;

  // 1) Cognitivos — envelope: abertura ≥2, não em crise, sem pedido prático.
  if (!emCrise && nivel >= 2 && !pedido_pratico) {
    for (const h of heuristicasTriggerMap ?? []) {
      const gat = h.gatilhos?.some((g: string) => txt.includes(normalizar(g)));
      if (gat && dentroFaixa(h.arquivo, intensidade, faixaCognitivos, defaultFaixaCognitivo)) {
        push({ arquivo: h.arquivo, cat: "cognitivo", score: 2 });
      }
    }
    // Embedding (se presente) — também respeita faixa
    for (const he of heuristicasEmbedding ?? []) {
      const s = Math.min(1, Math.max(0, he.similarity ?? he.similaridade ?? 0.6));
      const arq = he?.arquivo as string | undefined;
      if (arq && dentroFaixa(arq, intensidade, faixaCognitivos, defaultFaixaCognitivo)) {
        push({ arquivo: arq, cat: "cognitivo", score: 1 + 2 * s });
      }
    }
    // Heurística ativa sugerida externamente
    if (heuristicaAtiva?.arquivo && dentroFaixa(heuristicaAtiva.arquivo, intensidade, faixaCognitivos, defaultFaixaCognitivo)) {
      push({ arquivo: heuristicaAtiva.arquivo, cat: "cognitivo", score: 2.5 });
    }
  }

  // 2) Filosófico/Estoico — envelope: abertura ≥2, sem pedido prático, não em crise; faixa por arquivo
  if (!emCrise && nivel >= 2 && !pedido_pratico) {
    for (const e of estoicosTriggerMap ?? []) {
      const gat = e.gatilhos?.some((g: string) => txt.includes(normalizar(g)));
      if (!gat) continue;
      if (dentroFaixa(e.arquivo, intensidade, faixaEstoicos)) {
        push({ arquivo: e.arquivo, cat: "filosofico", score: 2.5 });
      }
    }
  }

  // 3) Emocionais — por tags/emoções + intensidadeMin + gatilho textual
  const tags = memsUsadas?.flatMap((m) => m.tags ?? []) ?? [];
  const emos = memsUsadas?.map((m) => m.emocao_principal).filter(Boolean) ?? [];

  for (const m of emocionaisTriggerMap ?? []) {
    if (!m?.arquivo) continue;

    const minOK = typeof m.intensidadeMinima === "number" ? intensidade >= m.intensidadeMinima : true;

    // aceita tanto `tags` quanto `tags_gatilho` e `emocoes`/`emocoes_gatilho`
    const tagMatch = (m.tags ?? (m as any).tags_gatilho ?? []).some((t: string) => tags.includes(t));
    const emoMatch = ((m as any).emocoes ?? (m as any).emocoes_gatilho ?? []).some((e: string) => emos.includes(e));
    const gatMatch = (m.gatilhos ?? []).some((g: string) => txt.includes(normalizar(g)));

    if (minOK && (tagMatch || emoMatch || gatMatch)) {
      // bônus se intensidade alta
      push({ arquivo: m.arquivo, cat: "emocional", score: 3 + (intensidade >= 7 ? 1 : 0) });
    }
  }

  // ===== ranking + cooldown =====
  const ranked = cands
    .filter((c) => !inCooldown(userId, c.arquivo, 900))
    .sort((a, b) => b.score - a.score);

  // ===== prioridade de categoria + HARD_CAP_EXTRAS =====
  const byCat: Record<Cat, ExtraCand[]> = { emocional: [], cognitivo: [], filosofico: [] };
  for (const c of ranked) byCat[c.cat].push(c);

  const cap = Math.max(1, HARD_CAP_EXTRAS || 1);
  const ordem: Cat[] = ["emocional", "cognitivo", "filosofico"];

  const final: string[] = [];
  for (const cat of ordem) {
    for (const cand of byCat[cat]) {
      if (!final.includes(cand.arquivo)) final.push(cand.arquivo);
      if (final.length >= cap) break;
    }
    if (final.length >= cap) break;
  }

  mark(userId, final);
  return final;
}

/* util small */
export const tagsDeHeuristica = (h?: Heuristica | null) =>
  h ? (tagsPorHeuristica[h.arquivo] ?? []) : [];
