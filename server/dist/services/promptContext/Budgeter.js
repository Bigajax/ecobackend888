"use strict";
// server/services/promptContext/Budgeter.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.Budgeter = void 0;
exports.budgetModules = budgetModules;
exports.debugBudgetInfo = debugBudgetInfo;
function uniqueStable(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
        if (!seen.has(x)) {
            seen.add(x);
            out.push(x);
        }
    }
    return out;
}
function coalesceSep(sep) {
    if (typeof sep !== "number" || !Number.isFinite(sep) || sep < 0)
        return 1;
    return Math.floor(sep);
}
/**
 * Calcula o custo incremental de adicionar um módulo (tokens do módulo + separador).
 * Observação: assumimos 1 separador por módulo incluído, como no comportamento atual.
 */
function moduleCost(tokens, sep) {
    return tokens + sep;
}
/**
 * Aplica orçamento (versão funcional pura).
 * Estratégia:
 *   - Percorre `ordered` deduplicado.
 *   - Inclui módulo se couber no orçamento restante (considerando safetyMargin).
 *   - Caso contrário, adiciona em `cut` com anotação de +tokens que faltaram.
 */
function budgetModules({ ordered, tokenOf, budgetTokens, sepTokens, safetyMarginTokens = 0, }) {
    const sep = coalesceSep(sepTokens);
    const list = uniqueStable(ordered);
    const used = [];
    const cut = [];
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
function debugBudgetInfo(ordered, priority, budgetTokens, sepTokens = 1, safetyMarginTokens = 0) {
    return {
        ordered,
        priority,
        dedup: uniqueStable(ordered),
        budgetTokens,
        sepTokens: coalesceSep(sepTokens),
        safetyMarginTokens,
    };
}
/* ==================================================================== */
/*  CLASSE Budgeter (compat com "new Budgeter(...)")                     */
/* ==================================================================== */
class Budgeter {
    tokenOf;
    budgetTokens;
    sepTokens;
    safetyMarginTokens;
    /**
     * @param maxTokens Orçamento total (exclui overhead de sistema)
     * @param tokenOf Função para obter tokens por módulo
     * @param sepTokens Tokens por separador (default 1)
     * @param safetyMarginTokens Reserva de segurança (default 0)
     */
    constructor(maxTokens, tokenOf, sepTokens = 1, safetyMarginTokens = 0) {
        this.budgetTokens = Math.max(0, maxTokens | 0);
        this.tokenOf = tokenOf;
        this.sepTokens = coalesceSep(sepTokens);
        this.safetyMarginTokens = Math.max(0, safetyMarginTokens | 0);
    }
    /**
     * Planeja os módulos que cabem no orçamento respeitando a ordem.
     */
    plan(ordered) {
        return budgetModules({
            ordered,
            tokenOf: this.tokenOf,
            budgetTokens: this.budgetTokens,
            sepTokens: this.sepTokens,
            safetyMarginTokens: this.safetyMarginTokens,
        });
    }
    /**
     * Atualiza o orçamento total.
     */
    setBudgetTokens(v) {
        this.budgetTokens = Math.max(0, v | 0);
    }
    /**
     * Atualiza o custo de separador.
     */
    setSepTokens(v) {
        this.sepTokens = coalesceSep(v);
    }
    /**
     * Atualiza a margem de segurança.
     */
    setSafetyMarginTokens(v) {
        this.safetyMarginTokens = Math.max(0, v | 0);
    }
    /**
     * Atualiza a função de custo por módulo (tokens).
     */
    setTokenOf(fn) {
        this.tokenOf = fn;
    }
    /**
     * Helper estático para um *one-off*.
     */
    static run(input) {
        return budgetModules(input);
    }
}
exports.Budgeter = Budgeter;
// (Opcional) default export, caso algum arquivo use `import Budgeter from './Budgeter'`
exports.default = Budgeter;
//# sourceMappingURL=Budgeter.js.map