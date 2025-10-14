import type { SimilarMemoryList } from "./contextTypes";
import type { TokenEncoder } from "../../utils/text";
import { getTokenEncoder } from "../../utils/text";

const TOKEN_LIMIT = 350; // orçamento por item (não por bloco)
const MAX_BLOCK_TOKENS = 600;
const MAX_ITEMS = 2;
const ELLIPSIS = "…";
const FALLBACK_CHARS_PER_TOKEN = 4; // heurística rápida para ausência de encoder

let cachedEllipsisLength: number | null = null;

function ellipsisTokenLength(encoder: TokenEncoder): number {
  if (cachedEllipsisLength != null) return cachedEllipsisLength;
  const len = Math.max(1, encoder.encode(ELLIPSIS).length);
  cachedEllipsisLength = len;
  return len;
}

function decodeSlice(encoder: TokenEncoder, tokens: number[], limit: number): string | null {
  if (typeof encoder.decode !== "function") return null;
  const slice = tokens.slice(0, limit);
  const decoded = encoder.decode(slice);
  return typeof decoded === "string" ? decoded : null;
}

function fallbackTrim(normalized: string): string {
  const charLimit = TOKEN_LIMIT * FALLBACK_CHARS_PER_TOKEN;
  if (normalized.length <= charLimit) {
    return normalized;
  }
  const trimmed = normalized.slice(0, Math.max(1, charLimit - 1)).replace(/\s+$/u, "");
  return trimmed ? `${trimmed}${ELLIPSIS}` : ELLIPSIS;
}

function normalizeAndLimit(text: string): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const encoder = getTokenEncoder();
  if (!encoder) {
    return fallbackTrim(normalized);
  }

  const tokens = encoder.encode(normalized);
  if (tokens.length <= TOKEN_LIMIT) {
    return normalized;
  }

  const ellipsisLength = ellipsisTokenLength(encoder);
  const availableTokens = Math.max(0, TOKEN_LIMIT - ellipsisLength);
  if (availableTokens === 0) {
    return ELLIPSIS;
  }

  const decoded = decodeSlice(encoder, tokens, availableTokens);
  if (!decoded) {
    return fallbackTrim(normalized);
  }

  const trimmed = decoded.replace(/\s+$/u, "");
  if (!trimmed) {
    return ELLIPSIS;
  }

  return `${trimmed}${ELLIPSIS}`;
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

  const linhas = mems.slice(0, MAX_ITEMS).map((memory) => {
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

  let blocos = linhas.filter(Boolean);
  if (!blocos.length) {
    // Se por algum motivo nenhum item resultou em linha válida, mantenha o cabeçalho
    return `${header}\n(nenhuma encontrada desta vez)`;
  }

  if (blocos.length > 1) {
    const encoder = getTokenEncoder();
    const blockPreview = [header, ...blocos].join("\n");
    const estimatedTokens = encoder
      ? encoder.encode(blockPreview).length
      : Math.ceil(blockPreview.length / FALLBACK_CHARS_PER_TOKEN);
    if (estimatedTokens > MAX_BLOCK_TOKENS) {
      blocos = blocos.slice(0, 1);
    }
  }

  // 🔹 Importante: sem instruções que proíbam “lembrar”.
  // A MEMORY_POLICY no ContextBuilder já define como a IA deve falar sobre memórias.
  return [header, ...blocos].join("\n");
}
