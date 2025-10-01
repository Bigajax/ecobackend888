import type { SimilarMemoryList } from "./contextTypes";
import { countTokens } from "../../utils/text";

const TOKEN_LIMIT = 350; // orçamento por item (não por bloco)

function normalizeAndLimit(text: string): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  if (countTokens(normalized) <= TOKEN_LIMIT) {
    return normalized;
  }

  // Truncamento por busca binária para caber no orçamento de tokens por memória
  let low = 0;
  let high = normalized.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = normalized.slice(0, mid).trim();
    if (!candidate) {
      high = mid - 1;
      continue;
    }
    if (countTokens(candidate) <= TOKEN_LIMIT) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let finalText = best || normalized.slice(0, Math.max(1, high)).trim();
  while (finalText.length > 1 && countTokens(`${finalText}…`) > TOKEN_LIMIT) {
    finalText = finalText.slice(0, -1).trim();
  }
  return `${finalText}…`;
}

function fmtScore(sim: number | undefined): string {
  if (typeof sim !== "number" || Number.isNaN(sim)) return "";
  const pct = Math.round(sim * 100);
  return ` ~${pct}%`;
}

function fmtWhen(iso?: string): string {
  if (!iso) return "";
  // Só o ano-mês-dia para não gastar tokens
  return new Date(iso).toISOString().slice(0, 10); // YYYY-MM-DD
}

export function formatMemRecall(mems: SimilarMemoryList): string {
  const header = "MEMORIAS_RELEVANTES:";

  if (!mems || !mems.length) {
    // 🔁 Sempre retorna um bloco — evita o disclaimer do LLM
    return `${header}\n(nenhuma encontrada desta vez)`;
  }

  const pickText = (memory: any) =>
    memory?.resumo_eco ||
    memory?.analise_resumo ||
    memory?.texto ||
    memory?.conteudo ||
    "";

  const linhas = mems.slice(0, 4).map((memory) => {
    const sim =
      typeof memory?.similarity === "number"
        ? memory.similarity
        : typeof memory?.similaridade === "number"
        ? memory.similaridade
        : undefined;

    const addScore = fmtScore(sim);
    const when = fmtWhen(memory?.created_at);
    const tags = Array.isArray(memory?.tags) && memory.tags.length
      ? ` [${memory.tags.slice(0, 3).join(", ")}]`
      : "";

    const value = normalizeAndLimit(String(pickText(memory)));
    if (!value) return "";

    // Ex.: "- (2025-09-14 [ansiedade, trabalho] ~82%) resumo curtinho…"
    const metaParts = [when, tags || undefined, addScore || undefined].filter(Boolean).join(" ");
    const meta = metaParts ? `(${metaParts}) ` : "";
    return `- ${meta}${value}`;
  });

  const blocos = linhas.filter(Boolean);
  if (!blocos.length) {
    // Se por algum motivo nenhum item resultou em linha válida, mantenha o cabeçalho
    return `${header}\n(nenhuma encontrada desta vez)`;
  }

  // 🔹 Importante: sem instruções que proíbam “lembrar”.
  // A MEMORY_POLICY no ContextBuilder já define como a IA deve falar sobre memórias.
  return [header, ...blocos].join("\n");
}
