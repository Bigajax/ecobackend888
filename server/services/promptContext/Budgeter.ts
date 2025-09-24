// server/services/promptContext/Budgeter.ts

/**
 * Budgeter — seleciona módulos respeitando um limite de tokens.
 * - Mantém ordem de prioridade estável.
 * - Deduplica módulos.
 * - Anota cortes com motivo (+tokens que faltaram).
 * - Permite reservar tokens para separadores e margem final.
 */

export type BudgetInput = {
  /** Lista de módulos (nomes) em ordem de prioridade desejada */
  ordered: string[];
  /** Função que retorna a contagem de tokens de um módulo (já cacheada no ModuleStore) */
  tokenOf: (name: string) => number;
  /** Orçamento total disponível para módulos (exclui overhead de sistema) */
  budgetTokens: number;
  /** Tokens por separador entre módulos (default: 1 como nos logs atuais) */
  sepTokens?: number;
  /** Reserva de margem para evitar estouro (default: 0) */
  safetyMarginTokens?: number;
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

/**
 * Calcula o custo incremental de adicionar um módulo (tokens do módulo + separador).
 * Observação: assumimos 1 separador por módulo incluído, como no comportamento atual.
 */
function moduleCost(tokens: number, sep: number): number {
  return tokens + sep;
}

/**
 * Aplica orçamento.
 * Estratégia:
 *   - Percorre `ordered` deduplicado.
 *   - Inclui módulo se couber no orçamento restante (considerando safetyMargin).
 *   - Caso contrário, adiciona em `cut` com anotação de +tokens que faltaram.
 */
export function budgetModules({
  ordered,
  tokenOf,
  budgetTokens,
  sepTokens,
  safetyMarginTokens = 0,
}: BudgetInput): BudgetResult {
  const sep = coalesceSep(sepTokens);
  const list = uniqueStable(ordered);

  const used: string[] = [];
  const cut: string[] = [];
  let total = 0;

  // Orçamento efetivo já descontando a margem de segurança.
  const hardCap = Math.max(0, budgetTokens - safetyMarginTokens);

  for (const name of list) {
    const modTokens = Math.max(0, tokenOf(name) | 0); // defensivo
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
};

export function debugBudgetInfo(
  ordered: string[],
  priority: string[],
  budgetTokens: number,
  sepTokens = 1,
  safetyMarginTokens = 0
): BudgetLog {
  return {
    ordered,
    priority,
    dedup: uniqueStable(ordered),
    budgetTokens,
    sepTokens: coalesceSep(sepTokens),
    safetyMarginTokens,
  };
}
