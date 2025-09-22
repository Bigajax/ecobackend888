import { ModuleStore } from "./ModuleStore";

export class Budgeter {
  constructor(private store = ModuleStore.I) {}

  async stitch(
    names: string[],
    opts: { priority?: string[]; budgetTokens: number }
  ): Promise<{ text: string; used: string[]; cut: string[]; tokens: number }> {
    const orderMap = new Map<string, number>();
    (opts.priority ?? []).forEach((n, i) => orderMap.set(n, i));

    const ordered = [...new Set(names)].sort((a, b) =>
      (orderMap.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b) ?? Number.MAX_SAFE_INTEGER)
    );

    let total = 0;
    const blocks: string[] = [];
    const used: string[] = [];
    const cut: string[] = [];

    for (const n of ordered) {
      const content = await this.store.read(n);
      if (!content) { cut.push(`${n} [missing]`); continue; }
      const t = this.store.tokenCountOf(n, content);

      if (total + t > opts.budgetTokens || opts.budgetTokens - total < Math.ceil(opts.budgetTokens * 0.1)) {
        cut.push(`${n} [budget]`); continue;
      }
      total += t; blocks.push(content); used.push(n);
    }
    const text = blocks.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text, used, cut, tokens: total };
  }
}
