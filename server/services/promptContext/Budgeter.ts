// server/services/promptContext/Budgeter.ts
import { ModuleStore } from "./ModuleStore";

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

    // Guarda de orçamento/entrada
    const used: string[] = [];
    const cut: string[] = [];
    if (!names?.length || budgetTokens <= 0) {
      return { text: "", used, cut: names ?? [], tokens: 0 };
    }

    // 1) Dedupe estável + ordenação por prioridade unificada
    const dedup = this.uniqPreservingOrder(names);
    const ordered = this.sortByPriorityStable(dedup, priority);

    // 2) Loop de montagem respeitando o orçamento
    let total = 0;
    const blocks: string[] = [];

    // Custo do separador também conta no orçamento
    const sepTokens = this.store.tokenCountOf("__sep__", separator);

    for (const n of ordered) {
      let content = await this.store.read(n);
      if (!content) {
        cut.push(`${n} [vazio/ausente]`);
        continue;
      }

      // Higieniza quebras excessivas
      content = content.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

      const t = this.store.tokenCountOf(n, content);
      const extra = used.length > 0 ? sepTokens : 0;

      // Se estourar orçamento, corta
      if (total + extra + t > budgetTokens) {
        cut.push(`${n} [sem orçamento: +${t} tokens]`);
        continue;
      }

      if (extra) blocks.push(separator);
      blocks.push(content);
      used.push(n);
      total += extra + t;
    }

    const text = blocks.join("").trim();
    return { text, used, cut, tokens: total };
  }
}

export default Budgeter;
