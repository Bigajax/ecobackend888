// server/services/promptContext/Selector.ts

import matrizPromptBaseV2 from "./matrizPromptBaseV2"; // ajuste o caminho se necessário
import { Camada, CondicaoEspecial } from "./types";
import type { HeuristicaFlagRecord } from "./heuristicaFlags";

/* ===================== Tipos & Interfaces ===================== */

export type Flags = {
  curiosidade: boolean;
  pedido_pratico: boolean;
  duvida_classificacao: boolean;

  // 🔥 Novas flags para o pipeline VIVA/roteamento:
  saudacao: boolean;
  factual: boolean;
  cansaco: boolean;
  desabafo: boolean;
  urgencia: boolean;
  emocao_alta_linguagem: boolean;
  crise: boolean; // ← ADICIONADO

  // 🔥 Heurísticas cognitivas (eco_heuristica_*.txt)
  ancoragem: boolean;
  causas_superam_estatisticas: boolean;
  certeza_emocional: boolean;
  excesso_intuicao_especialista: boolean;
  ignora_regressao_media: boolean;
};

export type BaseSelection = {
  nivel: 1 | 2 | 3;
  intensidade: number;
  flags: Flags;
  raw: string[];
  posGating: string[];
  priorizado: string[];
  cortados: string[];
};

/* ===================== Utils ===================== */

function normalize(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ===================== Heurísticas simples ===================== */

export function detectarSaudacaoBreve(texto?: string): boolean {
  const t = (texto || "").trim();
  if (!t) return true;
  const words = t.split(/\s+/).filter(Boolean);
  const curto = t.length <= 18 || words.length <= 3;
  const temSaud = /\b(oi|olá|ola|hey|e?a[iy]|bom dia|boa tarde|boa noite)\b/i.test(t);
  const leve = /^[\w\sáéíóúâêôãõç!?.,…-]{0,40}$/i.test(t);
  return (temSaud && curto) || (curto && leve);
}

function isIntense(text: string): boolean {
  const t = text.toLowerCase();
  const gatilhos = [
    /p[aâ]nico/,
    /crise/,
    /desesper/,
    /insuport/,
    /vontade de sumir/,
    /explod/,
    /taquicard|batimentos/i,
    /ansiedad|ang[uú]st/i,
  ];
  const longo = t.length >= 180;
  return longo || gatilhos.some((r) => r.test(t));
}

// Intensidade nominal 0–10 (proxy rápido)
export function estimarIntensidade0a10(text: string): number {
  if (!text.trim()) return 0;
  const base = isIntense(text) ? 7 : 3;
  const extra = Math.min(3, Math.floor(text.length / 200));
  return Math.max(0, Math.min(10, base + extra));
}

/* ===================== Nível de abertura ===================== */

export function derivarNivel(texto: string, saudacaoBreve: boolean): 1 | 2 | 3 {
  if (saudacaoBreve) return 1;
  const len = (texto || "").trim().length;
  if (len < 120) return 1;
  if (len < 300) return 2;
  return 3;
}

/* ===================== Flags ===================== */

export function derivarFlags(texto: string, heuristicaFlags: HeuristicaFlagRecord = {}): Flags {
  const raw = texto || "";
  const t = normalize(raw);

  // já existentes
  const curiosidade =
    /\b(como|por que|porque|pra que|para que|e se|poderia|podes|pode)\b/.test(t) || /\?$/.test(raw);
  const pedido_pratico =
    /\b(passos?|tutorial|guia|checklist|lista|exemplo|modelo|template|o que faco|o que fazer|me ajuda)\b/.test(t);
  const duvida_classificacao =
    /\b(nivel|abertura|intensidade|classificacao|classificar)\b/.test(t);

  // novas
  const saudacao =
    /\b(oi+|oie+|ola+|ola|ol[aá]|alo+|opa+|salve|bom dia|boa tarde|boa noite|boa madrugada)\b/.test(t);
  const factual =
    /\b(que dia|que data|horario|endereco|onde fica|preco|valor|numero|cpf|rg|link|url|site|telefone|contato|confirmar|confirmacao|agenda|quando|que horas)\b/.test(
      t
    );
  const cansaco =
    /\b(cansad[ao]|sem energia|esgotad[ao]|exaust[ao]|exausta|acabado|acabada|saturad[ao](?: mas (?:de boa|tranq|ok))?)\b/.test(
      t
    );
  const desabafo =
    /\b(so desabafando|queria desabafar|so queria falar|nao precisa responder|nao quero conselho|nao preciso de intervencao)\b/.test(
      t
    );
  const urgencia =
    /\b(preciso resolver ja|nao sei mais o que fazer|socorro|urgente|agora|pra ontem)\b/.test(t);
  const emocao_alta_linguagem =
    /\b(nao aguento|no limite|explodindo|desesperad[oa]|muito ansios[oa]|panico|crise|tremend[oa])\b/.test(
      t
    );

  // 🚨 crise (sinalização ampla: ideação/risco/severo)
  const crise = [
    /suicid/i,
    /me matar/i,
    /tirar minha vida/i,
    /acab(ar|ando) com tudo/i,
    /ou(v|b)o vozes/i,
    /psicose/i,
    /agredir/i,
    /viol[eê]ncia/i,
    /p[aá]nico (severo|forte)/i,
  ].some((r) => r.test(raw));

  return {
    curiosidade,
    pedido_pratico,
    duvida_classificacao,
    saudacao,
    factual,
    cansaco,
    desabafo,
    urgencia,
    emocao_alta_linguagem,
    crise, // ← ADICIONADO

    // heurísticas vindas do mapeamento
    ancoragem: Boolean(heuristicaFlags.ancoragem),
    causas_superam_estatisticas: Boolean(heuristicaFlags.causas_superam_estatisticas),
    certeza_emocional: Boolean(heuristicaFlags.certeza_emocional),
    excesso_intuicao_especialista: Boolean(heuristicaFlags.excesso_intuicao_especialista),
    ignora_regressao_media: Boolean(heuristicaFlags.ignora_regressao_media),
  };
}

/* ===================== Mini avaliador de regras =====================

Suporta expressões como:
- "nivel>=2 && intensidade>=7"
- "nivel>=2 && !pedido_pratico"
- "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico"

==================================================================== */

type Ctx = {
  nivel: number;
  intensidade: number;

  // boolean flags
  curiosidade: boolean;
  pedido_pratico: boolean;
  duvida_classificacao: boolean;
  saudacao: boolean;
  factual: boolean;
  cansaco: boolean;
  desabafo: boolean;
  urgencia: boolean;
  emocao_alta_linguagem: boolean;
  crise: boolean; // ← ADICIONADO

  ancoragem: boolean;
  causas_superam_estatisticas: boolean;
  certeza_emocional: boolean;
  excesso_intuicao_especialista: boolean;
  ignora_regressao_media: boolean;
};

function evalRule(rule: string, ctx: Ctx): boolean {
  if (!rule || typeof rule !== "string") return true;

  const orTerms = rule.split("||").map((s) => s.trim()).filter(Boolean);
  if (orTerms.length === 0) return true;

  const evalAnd = (expr: string): boolean => {
    const andTerms = expr.split("&&").map((s) => s.trim()).filter(Boolean);
    for (const term of andTerms) {
      // !flag
      const notFlag = term.match(/^!\s*([a-z_]+)$/i);
      if (notFlag) {
        const v = readVarBool(notFlag[1], ctx);
        if (v === null || v !== false) return false;
        continue;
      }
      // flag
      const flag = term.match(/^([a-z_]+)$/i);
      if (flag) {
        const v = readVarBool(flag[1], ctx);
        if (v !== true) return false;
        continue;
      }
      // comparações numéricas
      const cmp = term.match(/^([a-z_]+)\s*(>=|<=|==|!=|>|<)\s*([0-9]+)$/i);
      if (cmp) {
        const left = readVarNum(cmp[1], ctx);
        const op = cmp[2];
        const right = Number(cmp[3]);
        if (left === null) return false;
        if (!compare(left, op, right)) return false;
        continue;
      }
      // termo inválido
      return false;
    }
    return true;
  };

  for (const andExpr of orTerms) {
    if (evalAnd(andExpr)) return true;
  }
  return false;
}

function readVarBool(name: string, ctx: Ctx): boolean | null {
  switch (name) {
    case "curiosidade":
    case "pedido_pratico":
    case "duvida_classificacao":
    case "saudacao":
    case "factual":
    case "cansaco":
    case "desabafo":
    case "urgencia":
    case "emocao_alta_linguagem":
    case "crise": // ← ADICIONADO
    case "ancoragem":
    case "causas_superam_estatisticas":
    case "certeza_emocional":
    case "excesso_intuicao_especialista":
    case "ignora_regressao_media":
      return Boolean((ctx as any)[name]);
    default:
      return null;
  }
}

function readVarNum(name: string, ctx: Ctx): number | null {
  switch (name) {
    case "nivel":
    case "intensidade":
      return Number((ctx as any)[name]);
    default:
      return null;
  }
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    default:
      return false;
  }
}

/* ===================== Seleção base (Matriz V2 + gating) ===================== */

export const Selector = {
  derivarFlags,

  selecionarModulosBase({
    nivel,
    intensidade,
    flags,
  }: {
    nivel: 1 | 2 | 3;
    intensidade: number;
    flags: Flags;
  }): BaseSelection {
    const cortados: string[] = [];

    // NV1: somente os três minis definidos na matriz (byNivelV2[1].specific)
    if (nivel === 1) {
      const minis =
        matrizPromptBaseV2.byNivelV2[1]?.specific?.slice?.() ?? [
          "NV1_CORE.txt",
          "IDENTIDADE_MINI.txt",
          "ANTISALDO_MIN.txt",
        ];

      const priorizado = ordenarPorPrioridade(minis, matrizPromptBaseV2.limites?.prioridade, 1);
      return {
        nivel,
        intensidade,
        flags,
        raw: minis,
        posGating: priorizado,
        priorizado,
        cortados,
      };
    }

    // NV2/NV3: monta a lista a partir da matriz (specific + inherits -> baseModules)
    const spec = matrizPromptBaseV2.byNivelV2[nivel]?.specific ?? [];
    const inherits = matrizPromptBaseV2.byNivelV2[nivel]?.inherits ?? [];
    const inheritedModules = inherits.flatMap(
      (camada: Camada) => matrizPromptBaseV2.baseModules[camada] ?? []
    );
    const rawSet = new Set<string>([...spec, ...inheritedModules]);
    const raw = Array.from(rawSet);

    // Gating 1: intensidade mínima
    const gatedSet = new Set<string>(raw);
    for (const [mod, minInt] of Object.entries(matrizPromptBaseV2.intensidadeMinima ?? {})) {
      if (gatedSet.has(mod) && intensidade < Number(minInt)) {
        gatedSet.delete(mod);
        cortados.push(`${mod} [min=${minInt}]`);
      }
    }

    // Gating 2: regras semânticas (ativação condicional)
    // → se a regra bater, inclui; se não bater, não força remoção (exceto se já removido por intensidade).
    const ctx: Ctx = { nivel, intensidade, ...flags };
    const condicoes = Object.entries(
      (matrizPromptBaseV2.condicoesEspeciais ?? {}) as Record<string, CondicaoEspecial>
    );

    for (const [mod, cond] of condicoes) {
      try {
        if (evalRule(cond.regra, ctx)) {
          gatedSet.add(mod);
        }
      } catch {
        // regra malformada: ignorar silenciosamente
      }
    }

    const posGating = Array.from(gatedSet);
    const priorizado = ordenarPorPrioridade(
      posGating,
      matrizPromptBaseV2.limites?.prioridade,
      nivel
    );

    return {
      nivel,
      intensidade,
      flags,
      raw,
      posGating: priorizado,
      priorizado,
      cortados,
    };
  },
};

/* ===================== Helpers ===================== */

function ordenarPorPrioridade(
  arr: string[],
  priorityFromMatrix?: string[],
  nivel?: 1 | 2 | 3
): string[] {
  // Prioridade vinda da matriz (se houver)
  const priority = Array.isArray(priorityFromMatrix) ? priorityFromMatrix.slice() : [];

  // Em NV1 garantimos que os minis ficam no topo (caso alguém os injete indevidamente)
  if (nivel === 1) {
    ["NV1_CORE.txt", "IDENTIDADE_MINI.txt", "ANTISALDO_MIN.txt"].forEach((m) => {
      if (!priority.includes(m)) priority.unshift(m);
    });
  }

  // Índices de prioridade
  const idx = new Map<string, number>();
  priority.forEach((n, i) => idx.set(n, i));

  const dedup = Array.from(new Set(arr));
  dedup.sort((a, b) => (idx.get(a) ?? 999) - (idx.get(b) ?? 999) || a.localeCompare(b));
  return dedup;
}

export default Selector;
