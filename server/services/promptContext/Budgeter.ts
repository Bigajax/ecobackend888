// server/services/promptContext/Budgeter.ts

/**
 * Budgeter — seleciona módulos respeitando um limite de tokens.
 * - Mantém ordem de prioridade estável.
 * - Deduplica módulos.
 * - Anota cortes com motivo (+tokens que faltaram).
 * - Permite reservar tokens para separadores e margem final.
 * - **NOVO**: suporta `pinned` (itens fixos no início) e `orderWeights` (pesos absolutos).
 *
 * OBS: Exporta a classe `Budgeter` (named export) para compatibilidade com imports:
 *   import { Budgeter } from './Budgeter';
 * Também exporta as funções puras `budgetModules` e `debugBudgetInfo`.
 */

export type BudgetInput = {
  /** Lista de módulos (nomes) em ordem de prioridade desejada (baseline) */
  ordered: string[];
  /** Função que retorna a contagem de tokens de um módulo (já cacheada no ModuleStore) */
  tokenOf: (name: string) => number;
  /** Orçamento total disponível para módulos (exclui overhead de sistema) */
  budgetTokens: number;
  /** Tokens por separador entre módulos (default: 1 como nos logs atuais) */
  sepTokens?: number;
  /** Reserva de margem para evitar estouro (default: 0) */
  safetyMarginTokens?: number;

  /**
   * **NOVO**: Módulos fixos que devem ser considerados primeiro.
   * São deduplicados e movidos para o início antes do planejamento.
   * Ex.: ["developer_prompt.txt"]
   */
  pinned?: string[];

  /**
   * **NOVO**: Pesos absolutos para ordenação estável (menor = maior prioridade).
   * É aplicado após `pinned` e antes da ordem original de `ordered`.
   */
  orderWeights?: Record<string, number>;
};

export type BudgetResult = {
  /** Módulos incluídos, na ordem final */
  used: string[];
  /** Lista textual de cortes, seguindo padrão dos logs: "NOME [sem orçamento: +X tokens]" */
  cut: string[];
  /** Soma total de tokens consumidos (módulos + separadores) */
  tokens: number;
};

function uniqueStable<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function coalesceSep(sep?: number): number {
  if (typeof sep !== "number" || !Number.isFinite(sep) || sep < 0) return 1;
  return Math.floor(sep);
}

/** Comparator estável por pesos absolutos com fallback 999 */
function byWeights(a: string, b: string, weights?: Record<string, number>): number {
  const wa = weights?.[a];
  const wb = weights?.[b];
  const fa = Number.isFinite(wa as number) ? (wa as number) : 999;
  const fb = Number.isFinite(wb as number) ? (wb as number) : 999;
  return fa - fb;
}

/**
 * Calcula o custo incremental de adicionar um módulo (tokens do módulo + separador).
 * Observação: assumimos 1 separador por módulo incluído, como no comportamento atual.
 */
function moduleCost(tokens: number, sep: number): number {
  return tokens + sep;
}

/** Monta a lista final de avaliação: pinned → ordered (com pesos) → dedup */
function buildEvaluationList(
  ordered: string[],
  pinned: string[] | undefined,
  weights: Record<string, number> | undefined
): string[] {
  const base = uniqueStable(ordered.slice());
  const pins = uniqueStable((pinned ?? []).slice());
  // Remove pins que já estejam no base (dedup posterior preserva primeira ocorrência)
  const merged = [...pins, ...base];
  // Ordena: pins preservam sua própria ordem; o restante ordena por pesos absolutos
  // Estratégia: fatiamos pins + resto, aplicamos sort por pesos só no resto.
  const pinSet = new Set(pins);
  const rest = merged.filter((n) => !pinSet.has(n));
  rest.sort((a, b) => byWeights(a, b, weights));
  return uniqueStable([...pins, ...rest]);
}

/**
 * Aplica orçamento (versão funcional pura).
 * Estratégia:
 *   - Constrói lista de avaliação com `pinned` e `orderWeights`.
 *   - Percorre lista deduplicada.
 *   - Inclui módulo se couber no orçamento restante (considerando safetyMargin).
 *   - Caso contrário, adiciona em `cut` com anotação de +tokens que faltaram.
 */
export function budgetModules({
  ordered,
  tokenOf,
  budgetTokens,
  sepTokens,
  safetyMarginTokens = 0,
  pinned,
  orderWeights,
}: BudgetInput): BudgetResult {
  const sep = coalesceSep(sepTokens);
  const list = buildEvaluationList(ordered, pinned, orderWeights);

  const used: string[] = [];
  const cut: string[] = [];
  let total = 0;

  // Orçamento efetivo já descontando a margem de segurança.
  const hardCap = Math.max(0, budgetTokens - safetyMarginTokens);

  for (const name of list) {
    const modTokensRaw = tokenOf(name);
    const modTokens = Number.isFinite(modTokensRaw) ? Math.max(0, modTokensRaw | 0) : 0;
    const addCost = moduleCost(modTokens, sep);

    // Cabe? (usar hardCap para manter margem)
    if (total + addCost <= hardCap) {
      used.push(name);
      total += addCost;
      continue;
    }

    // Não coube: anotar corte com delta positivo
    const falta = Math.max(1, total + addCost - hardCap);
    cut.push(`${name} [sem orçamento: +${falta} tokens]`);
  }

  return { used, cut, tokens: total };
}

// ---------------------- Logging helper (opcional) ----------------------

export type BudgetLog = {
  ordered: string[];
  priority: string[];
  dedup: string[];
  budgetTokens: number;
  sepTokens: number;
  safetyMarginTokens: number;
  pinned: string[];
  orderWeights?: Record<string, number>;
};

export function debugBudgetInfo(
  ordered: string[],
  priority: string[],
  budgetTokens: number,
  sepTokens = 1,
  safetyMarginTokens = 0,
  pinned: string[] = [],
  orderWeights?: Record<string, number>
): BudgetLog {
  return {
    ordered,
    priority,
    dedup: uniqueStable(ordered),
    budgetTokens,
    sepTokens: coalesceSep(sepTokens),
    safetyMarginTokens,
    pinned: uniqueStable(pinned),
    orderWeights,
  };
}

/* ==================================================================== */
/*  CLASSE Budgeter (compat com "new Budgeter(...)")                    */
/* ==================================================================== */

export class Budgeter {
  private tokenOf: (name: string) => number;
  private budgetTokens: number;
  private sepTokens: number;
  private safetyMarginTokens: number;
  private pinned: string[];
  private orderWeights?: Record<string, number>;

  /**
   * @param maxTokens Orçamento total (exclui overhead de sistema)
   * @param tokenOf Função para obter tokens por módulo
   * @param sepTokens Tokens por separador (default 1)
   * @param safetyMarginTokens Reserva de segurança (default 0)
   * @param pinned Módulos fixos a serem avaliados primeiro (default [])
   * @param orderWeights Pesos absolutos de ordenação (default undefined)
   */
  constructor(
    maxTokens: number,
    tokenOf: (name: string) => number,
    sepTokens = 1,
    safetyMarginTokens = 0,
    pinned: string[] = [],
    orderWeights?: Record<string, number>
  ) {
    this.budgetTokens = Math.max(0, maxTokens | 0);
    this.tokenOf = tokenOf;
    this.sepTokens = coalesceSep(sepTokens);
    this.safetyMarginTokens = Math.max(0, safetyMarginTokens | 0);
    this.pinned = uniqueStable(pinned);
    this.orderWeights = orderWeights;
  }

  /**
   * Planeja os módulos que cabem no orçamento respeitando a ordem.
   */
  plan(ordered: string[]): BudgetResult {
    return budgetModules({
      ordered,
      tokenOf: this.tokenOf,
      budgetTokens: this.budgetTokens,
      sepTokens: this.sepTokens,
      safetyMarginTokens: this.safetyMarginTokens,
      pinned: this.pinned,
      orderWeights: this.orderWeights,
    });
  }

  /** Atualiza o orçamento total. */
  setBudgetTokens(v: number) {
    this.budgetTokens = Math.max(0, v | 0);
  }

  /** Atualiza o custo de separador. */
  setSepTokens(v: number) {
    this.sepTokens = coalesceSep(v);
  }

  /** Atualiza a margem de segurança. */
  setSafetyMarginTokens(v: number) {
    this.safetyMarginTokens = Math.max(0, v | 0);
  }

  /** Atualiza a função de custo por módulo (tokens). */
  setTokenOf(fn: (name: string) => number) {
    this.tokenOf = fn;
  }

  /** Define/atualiza módulos fixos. */
  setPinned(list: string[]) {
    this.pinned = uniqueStable(list ?? []);
  }

  /** Define/atualiza pesos absolutos. */
  setOrderWeights(weights?: Record<string, number>) {
    this.orderWeights = weights;
  }

  /**
   * Helper estático para um *one-off*.
   */
  static run(input: BudgetInput): BudgetResult {
    return budgetModules(input);
  }
}

// (Opcional) default export, caso algum arquivo use `import Budgeter from './Budgeter'`
export default Budgeter;
