// server/services/promptContext/Selector.ts

import matrizPromptBaseV2 from "./matrizPromptBaseV2";
import { Camada, CondicaoEspecial } from "./types";
import type { HeuristicaFlagRecord } from "./heuristicaFlags";
import type { ModuleCandidate, ModuleFrontMatter } from "./moduleCatalog";

/* ===================== Tipos & Interfaces ===================== */

export type Flags = {
  curiosidade: boolean;
  pedido_pratico: boolean;
  duvida_classificacao: boolean;

  // VIVA / roteamento
  saudacao: boolean;
  factual: boolean;
  cansaco: boolean;
  desabafo: boolean;
  urgencia: boolean;
  emocao_alta_linguagem: boolean;
  crise: boolean;

  // Vulnerabilidade & autorregulação
  vergonha: boolean;
  vulnerabilidade: boolean;
  defesas_ativas: boolean;
  combate: boolean;
  evitamento: boolean;
  autocritica: boolean;
  culpa_marcada: boolean;
  catastrofizacao: boolean;

  // aliases EN (debug/API)
  shame: boolean;
  vulnerability: boolean;
  active_defenses: boolean;
  avoidance: boolean;
  self_criticism: boolean;
  guilt: boolean;
  catastrophizing: boolean;

  // Heurísticas cognitivas
  ancoragem: boolean;
  causas_superam_estatisticas: boolean;
  certeza_emocional: boolean;
  excesso_intuicao_especialista: boolean;
  ignora_regressao_media: boolean;

  // Crise granular (usadas nas regras)
  ideacao: boolean;
  desespero: boolean;
  vazio: boolean;
  autodesvalorizacao: boolean;
};

export type BaseSelection = {
  nivel: 1 | 2 | 3;
  intensidade: number;
  flags: Flags;
  raw: string[];
  posGating: string[];
  priorizado: string[];
  cortados: string[];
  debug: { modules: ModuleDebugEntry[] };
};

export type ModuleDebugEntry = {
  id: string;
  source: "base" | "intensity" | "rule" | "front_matter" | "dedupe" | "budget";
  activated: boolean;
  threshold?: number | null;
  rule?: string | null;
  signals?: string[];
  reason?: string;
};

export type ModuleSelectionDebugEntry = ModuleDebugEntry;

export type DecSnapshot = {
  intensity: number;
  openness: 1 | 2 | 3;
  isVulnerable: boolean;
  vivaSteps: string[];
  saveMemory: boolean;
  hasTechBlock: boolean;
  tags: string[];
  domain: string | null;
  flags: Flags;
};

export type PreparedModule = {
  name: string;
  text: string;
  meta: ModuleFrontMatter;
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

  // básicas
  const curiosidade =
    /\b(como|por que|porque|pra que|para que|e se|poderia|podes|pode)\b/.test(t) || /\?$/.test(raw);
  const pedido_pratico =
    /\b(passos?|tutorial|guia|checklist|lista|exemplo|modelo|template|o que faco|o que fazer|me ajuda)\b/.test(t);
  const duvida_classificacao =
    /\b(nivel|abertura|intensidade|classificacao|classificar)\b/.test(t);

  // roteamento
  const saudacao =
    /\b(oi+|oie+|ola+|ola|ol[aá]|alo+|opa+|salve|bom dia|boa tarde|boa noite|boa madrugada)\b/.test(t);
  const factual =
    /\b(que dia|que data|horario|endereco|onde fica|preco|valor|numero|cpf|rg|link|url|site|telefone|contato|confirmar|confirmacao|agenda|quando|que horas)\b/.test(t);
  const cansaco =
    /\b(cansad[ao]|sem energia|esgotad[ao]|exaust[ao]|exausta|acabado|acabada|saturad[ao](?: mas (?:de boa|tranq|ok))?)\b/.test(t);
  const desabafo =
    /\b(so desabafando|queria desabafar|so queria falar|nao precisa responder|nao quero conselho|nao preciso de intervencao)\b/.test(t);
  const urgencia = /\b(preciso resolver ja|nao sei mais o que fazer|socorro|urgente|agora|pra ontem)\b/.test(t);
  const emocao_alta_linguagem =
    /\b(nao aguento|no limite|explodindo|desesperad[oa]|muito ansios[oa]|panico|crise|tremend[oa])\b/.test(t);

  // crise granular
  const ideacao = /suicid|me matar|tirar minha vida|acabar com tudo/i.test(raw);
  const desespero = /desesper|sem sa[ií]da|no limite/i.test(t);
  const vazio = /\bvazio\b|\bsem sentido\b|\bnada faz sentido\b/i.test(t);
  const autodesvalorizacao = /\b(n[aã]o presto|n[aã]o valho|sou um lixo|sou horr[ií]vel)\b/i.test(t);
  const crise = ideacao || desespero || vazio || autodesvalorizacao;

  // padrões
  const vergonha = /\b(vergonha|humilha[cç][aã]o|me escondo|me esconder)\b/.test(t);
  const vulnerabilidade = /\b(vulner[aá]vel|abrir meu cora[cç][aã]o|medo de me abrir)\b/.test(t);
  const defesas_ativas =
    /\b(racionalizo|racionalizando|minimizo|minimizando|faco piada|faço piada|mudo de assunto|fugir do tema)\b/.test(t);
  const combate = /\b(brigar|bater de frente|comprar briga|contra-ataco|contra ataco|contra-atacar)\b/.test(t);
  const evitamento = /\b(evito|evitando|fujo|fugindo|adi[oó]o|procrastino|adiar|adiando|adiamento)\b/.test(t);
  const autocritica = /\b(sou um lixo|sou horr[ií]vel|me detesto|sou fraco|sou fraca|falhei|fracassei)\b/.test(t);
  const culpa_marcada = /\b(culpa|culpada|culpado|me sinto culp[oa])\b/.test(t);
  const catastrofizacao =
    /\b(catastrof|vai dar tudo errado|nunca vai melhorar|tudo acaba|sempre ruim|nada funciona)\b/.test(t);

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
    crise,

    vergonha,
    vulnerabilidade,
    defesas_ativas,
    combate,
    evitamento,
    autocritica,
    culpa_marcada,
    catastrofizacao,

    shame: vergonha,
    vulnerability: vulnerabilidade,
    active_defenses: defesas_ativas,
    avoidance: evitamento,
    self_criticism: autocritica,
    guilt: culpa_marcada,
    catastrophizing: catastrofizacao,

    // heurísticas mapeadas externamente (ex.: fast-lane)
    ancoragem: Boolean(heuristicaFlags.ancoragem),
    causas_superam_estatisticas: Boolean(heuristicaFlags.causas_superam_estatisticas),
    certeza_emocional: Boolean(heuristicaFlags.certeza_emocional),
    excesso_intuicao_especialista: Boolean(heuristicaFlags.excesso_intuicao_especialista),
    ignora_regressao_media: Boolean(heuristicaFlags.ignora_regressao_media),

    // crise granular
    ideacao,
    desespero,
    vazio,
    autodesvalorizacao,
  };
}

/* ===================== Mini avaliador de regras =====================

Suporta:
- "nivel>=2 && intensidade>=7"
- "nivel>=2 && !pedido_pratico"
- "intensidade>=8 && nivel>=3 && (ideacao || desespero || vazio || autodesvalorizacao)"
- "intensidade>=7 && hasTechBlock==true"

==================================================================== */

type Ctx = {
  nivel: number;
  intensidade: number;
  hasTechBlock?: boolean;

  // flags
  curiosidade: boolean;
  pedido_pratico: boolean;
  duvida_classificacao: boolean;
  saudacao: boolean;
  factual: boolean;
  cansaco: boolean;
  desabafo: boolean;
  urgencia: boolean;
  emocao_alta_linguagem: boolean;
  crise: boolean;

  vergonha: boolean;
  vulnerabilidade: boolean;
  defesas_ativas: boolean;
  combate: boolean;
  evitamento: boolean;
  autocritica: boolean;
  culpa_marcada: boolean;
  catastrofizacao: boolean;

  shame: boolean;
  vulnerability: boolean;
  active_defenses: boolean;
  avoidance: boolean;
  self_criticism: boolean;
  guilt: boolean;
  catastrophizing: boolean;

  ancoragem: boolean;
  causas_superam_estatisticas: boolean;
  certeza_emocional: boolean;
  excesso_intuicao_especialista: boolean;
  ignora_regressao_media: boolean;

  ideacao: boolean;
  desespero: boolean;
  vazio: boolean;
  autodesvalorizacao: boolean;
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
      // numérico
      const cmpNum = term.match(/^([a-z_]+)\s*(>=|<=|==|!=|>|<)\s*([0-9]+)$/i);
      if (cmpNum) {
        const left = readVarNum(cmpNum[1], ctx);
        const op = cmpNum[2];
        const right = Number(cmpNum[3]);
        if (left === null) return false;
        if (!compare(left, op, right)) return false;
        continue;
      }
      // booleano: hasTechBlock==true / flag!=false
      const cmpBool = term.match(/^([a-z_]+)\s*(==|!=)\s*(true|false)$/i);
      if (cmpBool) {
        const left = readVarBool(cmpBool[1], ctx);
        if (left === null) return false;
        const want = cmpBool[3].toLowerCase() === "true";
        const ok = cmpBool[2] === "==" ? left === want : left !== want;
        if (!ok) return false;
        continue;
      }
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
    case "hasTechBlock":
    case "curiosidade":
    case "pedido_pratico":
    case "duvida_classificacao":
    case "saudacao":
    case "factual":
    case "cansaco":
    case "desabafo":
    case "urgencia":
    case "emocao_alta_linguagem":
    case "crise":
    case "vergonha":
    case "vulnerabilidade":
    case "defesas_ativas":
    case "combate":
    case "evitamento":
    case "autocritica":
    case "culpa_marcada":
    case "catastrofizacao":
    case "shame":
    case "vulnerability":
    case "active_defenses":
    case "avoidance":
    case "self_criticism":
    case "guilt":
    case "catastrophizing":
    case "ancoragem":
    case "causas_superam_estatisticas":
    case "certeza_emocional":
    case "excesso_intuicao_especialista":
    case "ignora_regressao_media":
    case "ideacao":
    case "desespero":
    case "vazio":
    case "autodesvalorizacao":
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
    case ">=": return a >= b;
    case "<=": return a <= b;
    case ">":  return a >  b;
    case "<":  return a <  b;
    case "==": return a === b;
    case "!=": return a !== b;
    default:   return false;
  }
}

function collectActiveSignals(rule: string | undefined, ctx: Ctx): string[] {
  if (!rule) return [];
  const tokens = rule.match(/[a-z_]+/gi) ?? [];
  const seen = new Set<string>();
  const signals: string[] = [];
  for (const token of tokens) {
    const key = token.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const value = readVarBool(key, ctx);
    if (value === true) {
      signals.push(key);
    }
  }
  return signals;
}

/* ===================== Seleção base (Matriz V2 + gating) ===================== */

export const Selector = {
  derivarFlags,

  selecionarModulosBase({
    nivel,
    intensidade,
    flags,
    hasTechBlock,
  }: {
    nivel: 1 | 2 | 3;
    intensidade: number;
    flags: Flags;
    hasTechBlock?: boolean;
  }): BaseSelection {
    const cortados: string[] = [];

    // NV1: somente os minis
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
        debug: {
          modules: minis.map((id) => ({ id, source: "base", activated: true })),
        },
      };
    }

    // NV2/NV3: specific + inherits(baseModules)
    const spec = matrizPromptBaseV2.byNivelV2[nivel]?.specific ?? [];
    const inherits = matrizPromptBaseV2.byNivelV2[nivel]?.inherits ?? [];
    const inheritedModules = inherits.flatMap(
      (camada: Camada) => matrizPromptBaseV2.baseModules[camada] ?? []
    );
    const rawSet = new Set<string>([...spec, ...inheritedModules]);
    const raw = Array.from(rawSet);
    const moduleDebugMap = new Map<string, ModuleDebugEntry>();
    raw.forEach((id) => {
      if (!moduleDebugMap.has(id)) moduleDebugMap.set(id, { id, source: "base", activated: true });
    });

    // Gating 1: intensidade mínima
    const gatedSet = new Set<string>(raw);
    for (const [mod, minInt] of Object.entries(matrizPromptBaseV2.intensidadeMinima ?? {})) {
      if (gatedSet.has(mod) && intensidade < Number(minInt)) {
        gatedSet.delete(mod);
        cortados.push(`${mod} [min=${minInt}]`);
        moduleDebugMap.set(mod, {
          id: mod,
          source: "intensity",
          activated: false,
          threshold: Number(minInt),
        });
      } else if (gatedSet.has(mod)) {
        moduleDebugMap.set(mod, {
          id: mod,
          source: "intensity",
          activated: true,
          threshold: Number(minInt),
        });
      }
    }

    // Gating 2: regras semânticas
    const ctx: Ctx = { nivel, intensidade, hasTechBlock, ...flags };
    const condicoes = Object.entries(
      (matrizPromptBaseV2.condicoesEspeciais ?? {}) as Record<string, CondicaoEspecial>
    );

    for (const [mod, cond] of condicoes) {
      try {
        const passed = evalRule(cond.regra, ctx);
        moduleDebugMap.set(mod, {
          id: mod,
          source: "rule",
          activated: passed,
          rule: cond.regra,
          signals: collectActiveSignals(cond.regra, ctx),
        });
        if (passed) {
          gatedSet.add(mod);
        }
      } catch {
        // regra malformada: ignora
      }
    }

    const posGating = Array.from(gatedSet);
    const priorizado = ordenarPorPrioridade(posGating, matrizPromptBaseV2.limites?.prioridade, nivel);

    return {
      nivel,
      intensidade,
      flags,
      raw,
      posGating: priorizado,
      priorizado,
      cortados,
      debug: { modules: Array.from(moduleDebugMap.values()) },
    };
  },

  applyModuleMetadata,
};

/* ===================== Helpers ===================== */

interface ApplyModuleMetadataParams {
  dec: DecSnapshot;
  baseOrder: string[];
  candidates: ModuleCandidate[];
}

interface ApplyModuleMetadataResult {
  regular: PreparedModule[];
  footers: PreparedModule[];
  orderedNames: string[];
  debug: Map<string, ModuleSelectionDebugEntry>;
}

type CandidateWithOrder = PreparedModule & { order: number; baseIndex: number };

function applyModuleMetadata({
  dec,
  baseOrder,
  candidates,
}: ApplyModuleMetadataParams): ApplyModuleMetadataResult {
  const indexByName = new Map<string, number>();
  baseOrder.forEach((name, idx) => indexByName.set(name, idx));

  const debug = new Map<string, ModuleSelectionDebugEntry>();
  const passing: CandidateWithOrder[] = [];

  for (const candidate of candidates) {
    const meta = candidate.meta ?? {};
    const { passes, reason, threshold } = evaluateFrontMatter(meta, dec);
    debug.set(candidate.name, {
      id: candidate.name,
      source: "front_matter",
      activated: passes,
      reason,
      threshold: threshold ?? null,
    });

    if (!passes) continue;

    const interpolated = interpolateDec(candidate.text, dec);
    const baseIndex = indexByName.get(candidate.name) ?? Number.MAX_SAFE_INTEGER;
    const orderValue = meta.order ?? baseIndex;

    passing.push({
      name: candidate.name,
      text: interpolated,
      meta,
      order: orderValue,
      baseIndex,
    });
  }

  passing.sort((a, b) =>
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
    a.baseIndex - b.baseIndex ||
    a.name.localeCompare(b.name)
  );

  const deduped: CandidateWithOrder[] = [];
  const dedupeKeys = new Map<string, string>();

  for (const candidate of passing) {
    const keyRaw = candidate.meta?.dedupeKey;
    if (!keyRaw) {
      deduped.push(candidate);
      continue;
    }

    const key = keyRaw.toLowerCase();
    if (dedupeKeys.has(key)) {
      const existing = debug.get(candidate.name);
      if (existing) {
        existing.activated = false;
        existing.source = "dedupe";
        existing.reason = `dedupe:${key}`;
        existing.threshold = null;
        debug.set(candidate.name, existing);
      } else {
        debug.set(candidate.name, {
          id: candidate.name,
          source: "dedupe",
          activated: false,
          reason: `dedupe:${key}`,
          threshold: null,
        });
      }
      continue;
    }

    dedupeKeys.set(key, candidate.name);
    deduped.push(candidate);
  }

  const regular: PreparedModule[] = [];
  const footers: PreparedModule[] = [];

  for (const candidate of deduped) {
    const inject = candidate.meta?.injectAs?.toLowerCase() ?? "";
    const prepared: PreparedModule = {
      name: candidate.name,
      text: candidate.text,
      meta: candidate.meta ?? {},
    };

    if (inject === "footer") {
      footers.push(prepared);
    } else {
      regular.push(prepared);
    }
  }

  const orderedNames = [...regular, ...footers].map((item) => item.name);

  return { regular, footers, orderedNames, debug };
}

function evaluateFrontMatter(
  meta: ModuleFrontMatter | undefined,
  dec: DecSnapshot
): { passes: boolean; reason: string; threshold: number | null } {
  if (!meta) return { passes: true, reason: "pass", threshold: null };

  const reasons: string[] = [];
  let threshold: number | null = null;

  if (typeof meta.minIntensity === "number" && dec.intensity < meta.minIntensity) {
    reasons.push(`min_intensity:${meta.minIntensity}`);
    threshold = meta.minIntensity;
  }

  if (typeof meta.maxIntensity === "number" && dec.intensity > meta.maxIntensity) {
    reasons.push(`max_intensity:${meta.maxIntensity}`);
    threshold = meta.maxIntensity;
  }

  if (Array.isArray(meta.opennessIn) && meta.opennessIn.length > 0) {
    const allowed = meta.opennessIn.map((n) => Number(n));
    if (!allowed.includes(dec.openness)) {
      reasons.push(`openness_in:${allowed.join("/")}`);
    }
  }

  if (meta.requireVulnerability && !dec.isVulnerable) {
    reasons.push("require_vulnerability");
  }

  if (Array.isArray(meta.flagsAny) && meta.flagsAny.length > 0) {
    const availableFlags = buildFlagMap(dec);
    const hasAny = meta.flagsAny.some((flag) => {
      const key = flag.trim();
      if (!key) return false;
      const normalized = key.toLowerCase();
      return Boolean(availableFlags[key] ?? availableFlags[normalized]);
    });

    if (!hasAny) {
      reasons.push(`flags_any:${meta.flagsAny.join(",")}`);
    }
  }

  const passes = reasons.length === 0;
  return { passes, reason: passes ? "pass" : reasons.join("|"), threshold };
}

function buildFlagMap(dec: DecSnapshot): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const entries = Object.entries(dec.flags ?? {});
  for (const [key, value] of entries) {
    if (!key) continue;
    out[key] = Boolean(value);
    out[key.toLowerCase()] = Boolean(value);
  }

  const extras: Record<string, boolean> = {
    hasTechBlock: dec.hasTechBlock,
    hastechblock: dec.hasTechBlock,
    saveMemory: dec.saveMemory,
    savememory: dec.saveMemory,
    isVulnerable: dec.isVulnerable,
    isvulnerable: dec.isVulnerable,
    vulnerable: dec.isVulnerable,
    vulneravel: dec.isVulnerable,
  };

  for (const [key, value] of Object.entries(extras)) {
    out[key] = value;
  }

  return out;
}

function interpolateDec(text: string, dec: DecSnapshot): string {
  if (!text) return "";

  return text.replace(/\{\{\s*DEC\.([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = (dec as Record<string, unknown>)[key];
    if (value == null) return "";
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item == null) return "";
          if (typeof item === "boolean") return item ? "true" : "false";
          return String(item);
        })
        .filter((item) => item.length > 0)
        .join(", ");
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  });
}

function ordenarPorPrioridade(
  arr: string[],
  priorityFromMatrix?: string[],
  nivel?: 1 | 2 | 3
): string[] {
  const priority = Array.isArray(priorityFromMatrix) ? priorityFromMatrix.slice() : [];

  if (nivel === 1) {
    ["NV1_CORE.txt", "IDENTIDADE_MINI.txt", "ANTISALDO_MIN.txt"].forEach((m) => {
      if (!priority.includes(m)) priority.unshift(m);
    });
  }

  const idx = new Map<string, number>();
  priority.forEach((n, i) => idx.set(n, i));

  const dedup = Array.from(new Set(arr));
  dedup.sort((a, b) => (idx.get(a) ?? 999) - (idx.get(b) ?? 999) || a.localeCompare(b));
  return dedup;
}

export default Selector;
