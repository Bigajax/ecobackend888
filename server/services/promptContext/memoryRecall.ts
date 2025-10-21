import type { SimilarMemoryList } from "./contextTypes";
import type { TokenEncoder } from "../../utils/text";
import { getTokenEncoder } from "../../utils/text";

const TOKEN_LIMIT = 300; // orçamento por item (não por bloco)
const MAX_BLOCK_TOKENS = 800;
const MAX_ITEMS = 5;
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

export function formatMemRecall(mems: SimilarMemoryList): string | null {
  if (!Array.isArray(mems) || mems.length === 0) {
    return null;
  }

  const pickText = (memory: any) =>
    memory?.resumo_eco ||
    memory?.analise_resumo ||
    memory?.texto ||
    memory?.conteudo ||
    "";

  const entries = mems.slice(0, MAX_ITEMS).map((memory, index) => {
    const rawScore =
      typeof memory?.similarity === "number"
        ? memory.similarity
        : typeof memory?.similaridade === "number"
        ? memory.similaridade
        : undefined;

    const score = Number.isFinite(rawScore) ? Number(rawScore) : null;
    const scoreStr = score != null ? score.toFixed(3) : "---";
    const tagsRaw = Array.isArray(memory?.tags)
      ? memory.tags.filter((tag: unknown) => typeof tag === "string" && tag.trim().length > 0)
      : [];
    const tags = tagsRaw.slice(0, 3).join(", ") || "—";
    const normalizedText = normalizeAndLimit(String(pickText(memory)));
    if (!normalizedText) return "";

    const lineHeader = `• [${index + 1}] score=${scoreStr} tags=${tags}`;
    return `${lineHeader}\n${normalizedText}`;
  });

  let validEntries = entries.filter((line) => line.length > 0);
  if (!validEntries.length) {
    return null;
  }

  if (validEntries.length > 1) {
    const encoder = getTokenEncoder();
    const preview = ["MEMÓRIAS PERTINENTES", ...validEntries].join("\n");
    const estimatedTokens = encoder
      ? encoder.encode(preview).length
      : Math.ceil(preview.length / FALLBACK_CHARS_PER_TOKEN);
    if (estimatedTokens > MAX_BLOCK_TOKENS) {
      validEntries = validEntries.slice(0, 1);
    }
  }

  return ["MEMÓRIAS PERTINENTES", ...validEntries].join("\n");
}
