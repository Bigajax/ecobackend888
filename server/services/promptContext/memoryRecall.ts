import type { SimilarMemoryList } from "./contextTypes";

export function formatMemRecall(mems: SimilarMemoryList): string {
  if (!mems || !mems.length) return "";

  const pickText = (memory: any) =>
    memory?.resumo_eco ||
    memory?.analise_resumo ||
    memory?.texto ||
    memory?.conteudo ||
    "";

  const linhas = mems.slice(0, 3).map((memory) => {
    const sim =
      typeof memory?.similarity === "number"
        ? memory.similarity
        : typeof memory?.similaridade === "number"
        ? memory.similaridade
        : undefined;

    const pct = typeof sim === "number" ? ` ~${Math.round(sim * 100)}%` : "";
    const linha = String(pickText(memory)).replace(/\s+/g, " ").slice(0, 220);
    return `- ${linha}${linha.length >= 220 ? "…" : ""}${pct}`;
  });

  return [
    "CONTINUIDADE — SINAIS DO HISTÓRICO (use com leveza, sem afirmar que “lembra”):",
    ...linhas,
    "Se (e somente se) fizer sentido, pode contextualizar com: “uma coisa que você compartilhou foi…”.",
  ].join("\n");
}
