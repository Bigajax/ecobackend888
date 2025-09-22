import { evalRule } from "../../utils/ruleEval";
import { heuristicasTriggerMap, tagsPorHeuristica } from "../../assets/config/heuristicasTriggers";
import { filosoficosTriggerMap } from "../../assets/config/filosoficosTriggers";
import { estoicosTriggerMap } from "../../assets/config/estoicosTriggers";
import { emocionaisTriggerMap } from "../../assets/config/emocionaisTriggers";
import { heuristicaNivelAbertura } from "../../utils/heuristicaNivelAbertura";
import { GREET_RE, HARD_CAP_EXTRAS, MAX_LEN_FOR_GREETING } from "../../utils/config";
import type { Memoria, Heuristica, NivelNum } from "../../utils/types";

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export const isV2Matrix = (m: any) => !!m?.byNivelV2 && !!m?.baseModules;

export const resolveModulesForLevelV2 = (nivel: NivelNum, m: any): string[] => {
  const cfg = m.byNivelV2[nivel]; if (!cfg) return [];
  const inherited = cfg.inherits.flatMap((cat: string) => m.baseModules?.[cat] ?? []);
  return [...inherited, ...cfg.specific];
};

export function selecionarModulosBase({
  nivel, intensidade, matriz, flags,
}:{
  nivel: NivelNum; intensidade: number; matriz: any;
  flags: { curiosidade?: boolean; duvida_classificacao?: boolean; pedido_pratico?: boolean };
}) {
  const arrays = () => {
    if (isV2Matrix(matriz)) {
      const level = matriz.byNivelV2[nivel];
      const inherited = level?.inherits?.flatMap((cat: string) => matriz.baseModules?.[cat] ?? []) ?? [];
      const specific  = level?.specific ?? [];
      return { raw: [...inherited, ...specific], inherited, specific };
    }
    const raw = [ ...(matriz.alwaysInclude ?? []), ...(matriz.byNivel?.[nivel] ?? []) ];
    return { raw, inherited: matriz.alwaysInclude ?? [], specific: matriz.byNivel?.[nivel] ?? [] };
  };
  const { raw, inherited, specific } = arrays();
  const dedup = [...new Set(raw)];
  const cortados: string[] = [];

  const posGating = dedup.filter((arquivo) => {
    if (!arquivo?.trim()) return false;
    const min = matriz.intensidadeMinima?.[arquivo];
    if (typeof min === "number" && intensidade < min) { cortados.push(`${arquivo} [min=${min}]`); return false; }
    const cond = matriz.condicoesEspeciais?.[arquivo];
    if (!cond) return true;
    const ok = evalRule(cond.regra, { nivel, intensidade, ...flags });
    if (!ok) cortados.push(`${arquivo} [regra=${cond.regra}]`);
    return ok;
  });

  return {
    selecionados: posGating,
    debug: { raw: dedup, inherited, specific, posGating, cortadosPorRegraOuIntensidade: cortados }
  };
}

export function detectarSaudacaoBreve(t: string) {
  const s = normalizar(t || "");
  return s.length > 0 && s.length <= MAX_LEN_FOR_GREETING && GREET_RE.test(s);
}

export function derivarNivel(entrada: string, saudacaoBreve: boolean): NivelNum {
  let n: any = heuristicaNivelAbertura(entrada) || 1;
  if (typeof n === "string") {
    const s = n.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    n = (s === "baixo" ? 1 : s === "medio" ? 2 : 3);
  }
  if (saudacaoBreve) n = 1;
  if (n < 1 || n > 3) n = 1;
  return n as NivelNum;
}

export function derivarFlags(entrada: string) {
  const curiosidade = /\b(por que|porque|pq|explica|explic(a|ar)|entender|entende|curios)\b/i.test(entrada);
  const pedido_pratico = /\b(o que faço|o que eu faço|como faço|como falo|pode ajudar|tem (ideia|dica)|me ajuda|ajuda com|sugest(ão|oes))\b/i.test(entrada);
  return { curiosidade, pedido_pratico, duvida_classificacao: false };
}

// ===== extras rankeados com cooldown
type Cat = "emocional"|"cognitivo"|"filosofico";
type ExtraCand = { arquivo: string; cat: Cat; score: number };
const lastTriggeredByUser = new Map<string, Record<string, number>>();

const inCooldown = (uid?: string, arq?: string, secs=900) => {
  if (!uid || !arq) return false;
  const rec = lastTriggeredByUser.get(uid) ?? {};
  const last = rec[arq] ?? 0;
  return (Date.now()/1000 - last) < secs;
};

const mark = (uid?: string, arqs: string[] = []) => {
  if (!uid) return;
  const rec = lastTriggeredByUser.get(uid) ?? {};
  const now = Math.floor(Date.now()/1000);
  for (const a of arqs) rec[a] = now;
  lastTriggeredByUser.set(uid, rec);
};

export function selecionarExtras({
  userId, entrada, nivel, intensidade, memsUsadas, heuristicaAtiva, heuristicasEmbedding
}: {
  userId?: string; entrada: string; nivel: NivelNum; intensidade: number; memsUsadas?: Memoria[];
  heuristicaAtiva?: Heuristica; heuristicasEmbedding?: any[];
}) {
  const txt = normalizar(entrada || "");
  const cands: ExtraCand[] = [];
  const push = (x: ExtraCand) => {
    const i = cands.findIndex(c => c.arquivo === x.arquivo);
    if (i>=0){ if(x.score>cands[i].score) cands[i]=x; }
    else cands.push(x);
  };

  // cognitivos
  for (const h of (heuristicasTriggerMap ?? [])) {
    if (h.gatilhos?.some((g: string) => txt.includes(normalizar(g))) && intensidade <= 6) {
      push({ arquivo: h.arquivo, cat: "cognitivo", score: 2 });
    }
  }
  for (const he of (heuristicasEmbedding ?? [])) {
    const s = Math.min(1, Math.max(0, he.similarity ?? he.similaridade ?? 0.6));
    if (intensidade <= 6 && he?.arquivo) push({ arquivo: he.arquivo, cat: "cognitivo", score: 1 + 2*s });
  }
  if (heuristicaAtiva?.arquivo && intensidade <= 6) {
    push({ arquivo: heuristicaAtiva.arquivo, cat: "cognitivo", score: 2.5 });
  }

  // filosóficos/estoicos
  const okFilo = (nivel>=2 && intensidade>=3 && intensidade<=6);
  if (okFilo) {
    for (const f of (filosoficosTriggerMap ?? [])) {
      if (f.gatilhos?.some((g: string) => txt.includes(normalizar(g)))) {
        push({ arquivo: f.arquivo, cat: "filosofico", score: 2 });
      }
    }
    for (const e of (estoicosTriggerMap ?? [])) {
      // 🔧 bug: antes estava normalizar(e) — deve ser o gatilho `g`
      if (e.gatilhos?.some((g: string) => txt.includes(normalizar(g)))) {
        push({ arquivo: e.arquivo, cat: "filosofico", score: 2.5 });
      }
    }
  }

  // emocionais
  const tags = memsUsadas?.flatMap(m => m.tags ?? []) ?? [];
  const emos = memsUsadas?.map(m => m.emocao_principal).filter(Boolean) ?? [];
  for (const m of (emocionaisTriggerMap ?? [])) {
    if (!m?.arquivo) continue;
    const minOK = (typeof m.intensidadeMinima==='number') ? (intensidade >= m.intensidadeMinima) : true;
    const tagMatch = (m.tags ?? []).some((t: string) => tags.includes(t));
    const emoMatch = (m.tags ?? []).some((t: string) => emos.includes(t));
    const gatMatch = (m.gatilhos ?? []).some((g: string) => txt.includes(normalizar(g)));
    if (minOK && (tagMatch || emoMatch || gatMatch)) {
      push({ arquivo: m.arquivo, cat: "emocional", score: 3 + (intensidade>=7?1:0) });
    }
  }

  const cool = cands.filter(c => !inCooldown(userId, c.arquivo, 900)).sort((a,b) => b.score - a.score);
  const want: Record<Cat, number> = { emocional: (intensidade>=7?1:0), cognitivo: 1, filosofico: 1 };
  const used: Record<Cat, number> = { emocional:0, cognitivo:0, filosofico:0 };
  const sel: string[] = [];
  for (const c of cool) if (used[c.cat] < want[c.cat]) { sel.push(c.arquivo); used[c.cat] += 1; }
  if (intensidade>=7 && !sel.some(a => cands.find(c=>c.arquivo===a)?.cat==='emocional')) {
    const emo = cool.find(c=>c.cat==='emocional'); if (emo) sel.push(emo.arquivo);
  }
  const final = sel.slice(0, HARD_CAP_EXTRAS);
  mark(userId, final);
  return final;
}

export const tagsDeHeuristica = (h?: Heuristica | null) => h ? (tagsPorHeuristica[h.arquivo] ?? []) : [];
