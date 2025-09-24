// server/services/promptContext/Budgeter.ts
import { ModuleStore } from "./ModuleStore";

type StitchOpts = {
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
    if (!priority || priority.length === 0) return names;
    const rank = new Map<string, number>();
    priority.forEach((p, i) => rank.set(p, i));
    return [...names].sort((a, b) => {
      const ra = rank.has(a) ? (rank.get(a) as number) : Number.POSITIVE_INFINITY;
      const rb = rank.has(b) ? (rank.get(b) as number) : Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      // estável: quando empatar na prioridade, mantém a ordem original
      return names.indexOf(a) - names.indexOf(b);
    });
  }

  async stitch(
    names: string[],
    opts: StitchOpts
  ): Promise<{ text: string; used: string[]; cut: string[]; tokens: number }> {
    const { budgetTokens, priority, separator = "\n\n" } = opts;

    // 1) dedupe estável + ordenação por prioridade unificada
    const dedup = this.uniqPreservingOrder(names);
    const ordered = this.sortByPriorityStable(dedup, priority);

    let total = 0;
    const blocks: string[] = [];
    const used: string[] = [];
    const cut: string[] = [];

    // custo do separador (conta no orçamento)
    const sepTokens = this.store.tokenCountOf("__sep__", separator);

    for (const n of ordered) {
      let content = await this.store.read(n);
      if (!content) {
        cut.push(`${n} [vazio/ausente]`);
        continue;
      }

      // higieniza quebras em excesso
      content = content.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      const t = this.store.tokenCountOf(n, content);

      // custo se incluir este módulo agora (considera separador quando já existe bloco anterior)
      const nextCost = total + (used.length > 0 ? sepTokens : 0) + t;
      if (nextCost > budgetTokens) {
        cut.push(`${n} [sem orçamento: +${t} tokens]`);
        continue;
      }

      if (used.length > 0) blocks.push(separator);
      blocks.push(content);
      used.push(n);
      total = nextCost;
    }

    const text = blocks.join("").trim();
    return { text, used, cut, tokens: total };
  }
}

export default Budgeter;
