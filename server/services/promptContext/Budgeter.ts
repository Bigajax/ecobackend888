// server/services/promptContext/Budgeter.ts
import { ModuleStore } from "./ModuleStore";
import { log, isDebug } from "./logger"; // ⬅️ logger externo

type StitchOpts = {
  /** Orçamento total de tokens disponível para os módulos. */
  budgetTokens: number;
  /** Ordem de prioridade (primeiro = mais importante). */
  priority?: string[];
  /** Separador entre módulos concatenados. */
  separator?: string;
};

export class Budgeter {
  constructor(private store = ModuleStore.I) {}

  private uniqPreservingOrder(arr: (string | null | undefined)[]) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of arr) {
      const s = (v ?? "").trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  private sortByPriorityStable(names: string[], priority?: string[]) {
    if (!priority?.length) return names;
    const rank = new Map<string, number>(priority.map((p, i) => [p, i]));
    return [...names].sort((a, b) => {
      const ia = rank.has(a) ? (rank.get(a) as number) : Number.POSITIVE_INFINITY;
      const ib = rank.has(b) ? (rank.get(b) as number) : Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib;
      // Estável: preserva ordem original quando a prioridade empata
      return names.indexOf(a) - names.indexOf(b);
    });
  }

  async stitch(
    names: string[],
    opts: StitchOpts
  ): Promise<{ text: string; used: string[]; cut: string[]; tokens: number }> {
    const { budgetTokens = 0, priority, separator = "\n\n" } = opts;

    const used: string[] = [];
    const cut: string[] = [];

    if (!names?.length || budgetTokens <= 0) {
      if (isDebug()) log.debug("[Budgeter] entrada vazia ou orçamento zero", { names, budgetTokens });
      return { text: "", used, cut: names ?? [], tokens: 0 };
    }

    // 1) Dedupe estável + ordenação por prioridade unificada
    const dedup = this.uniqPreservingOrder(names);
    const ordered = this.sortByPriorityStable(dedup, priority);

    if (isDebug()) {
      log.debug("[Budgeter] orçamento", { budgetTokens });
      log.debug("[Budgeter] nomes(dedup)->ordered", { dedup, ordered, priority });
    }

    // 2) Loop de montagem respeitando o orçamento
    let total = 0;
    const blocks: string[] = [];

    // Custo do separador também conta no orçamento
    const sepTokens = this.store.tokenCountOf("__sep__", separator);

    for (const n of ordered) {
      let content = await this.store.read(n);
      if (!content) {
        cut.push(`${n} [vazio/ausente]`);
        if (isDebug()) log.debug("[Budgeter] cortado (ausente)", { n });
        continue;
      }

      // Higieniza quebras excessivas
      content = content.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

      const t = this.store.tokenCountOf(n, content);
      const extra = used.length > 0 ? sepTokens : 0;

      // Se estourar orçamento, corta
      if (total + extra + t > budgetTokens) {
        cut.push(`${n} [sem orçamento: +${t} tokens]`);
        if (isDebug()) log.debug("[Budgeter] cortado por orçamento", {
          n, moduloTokens: t, sepTokens: extra, totalAntes: total, budgetTokens
        });
        continue;
      }

      if (extra) blocks.push(separator);
      blocks.push(content);
      used.push(n);
      total += extra + t;

      if (isDebug()) log.trace?.("[Budgeter] incluído", { n, acumulado: total });
    }

    const text = blocks.join("").trim();

    if (isDebug()) log.debug("[Budgeter] resultado", { used, cut, tokens: total });

    return { text, used, cut, tokens: total };
  }
}

export default Budgeter;
