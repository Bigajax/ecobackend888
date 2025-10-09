// server/utils/text.ts

// -----------------------------
// Tempo & utilitários básicos
// -----------------------------
export const now = () => Date.now();
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ensureEnvs() {
  const required = ["OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`ENVs ausentes: ${missing.join(", ")}`);
}

// -----------------------------
// Mapeamento de roles p/ OpenAI
// -----------------------------
export const mapRoleForOpenAI = (
  role: string,
): "user" | "assistant" | "system" => {
  if (role === "assistant" || role === "model") {
    return "assistant";
  }
  if (role === "system") {
    return "system";
  }
  return "user";
};

// -----------------------------
// Sanitização & formatação
// -----------------------------
const TECH_BLOCK_HINT_KEYS = new Set([
  "intensidade",
  "analise_resumo",
  "resumo",
  "emocao_principal",
  "categoria",
  "tags",
  "dominio_vida",
  "padrao_comportamental",
  "nivel_abertura",
]);

function removeTechBlockJson(text: string): string {
  if (!text) return text;

  const jsonRegex = /\{[\s\S]*?\}/g;
  let match: RegExpExecArray | null;
  let current = text;

  while ((match = jsonRegex.exec(current))) {
    try {
      const parsed = JSON.parse(match[0]);
      const keys = Object.keys(parsed ?? {});
      if (!keys.length) continue;

      let matches = 0;
      for (const key of keys) {
        if (TECH_BLOCK_HINT_KEYS.has(key)) {
          matches += 1;
        }
      }

      // Considera bloco técnico apenas se vários campos conhecidos estiverem presentes.
      if (matches >= 2) {
        const before = current.slice(0, match.index).replace(/\s+$/, "");
        const after = current
          .slice(match.index + match[0].length)
          .replace(/^\s+/, "");

        current = before && after ? `${before}\n\n${after}` : before || after;
        jsonRegex.lastIndex = 0;
      }
    } catch {
      // Ignora blocos que não são JSON válido.
    }
  }

  return current;
}

export const limparResposta = (t: string) => {
  const sanitized = (t || "")
    // remove blocos de código JSON e genéricos
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/gi, "")
    // remove HTML
    .replace(/<[^>]*>/g, "")
    // remove títulos ###...###
    .replace(/###.*?###/g, "")
    // normaliza quebras
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return removeTechBlockJson(sanitized).trim();
};

export const formatarTextoEco = (t: string) =>
  (t || "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*\n\s*/g, "\n")
    // garante parágrafos (linha simples -> parágrafo)
    .replace(/(?<!\n)\n(?!\n)/g, "\n\n")
    // bullets bonitinhas
    .replace(/^\s+-\s+/gm, "— ")
    // tira espaços no início de linha
    .replace(/^\s+/gm, "")
    .trim();

// -----------------------------
// Normalização & parsing seguro
// -----------------------------

/**
 * Normaliza texto para comparações/regex:
 * - lower case
 * - remove acentos
 * - trim
 */
export const normalizeText = (t: string) =>
  (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

/**
 * Tenta extrair o primeiro JSON válido de um texto.
 * Se falhar, retorna null (não lança).
 */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

// -----------------------------
// Contador de tokens (opcional)
// -----------------------------

export type TokenEncoder = {
  encode: (text: string) => number[];
  decode?: (tokens: number[]) => string;
};

let _encoder: TokenEncoder | null = null;
let _encoderTried = false;

export function getTokenEncoder(): TokenEncoder | null {
  if (_encoder) return _encoder;
  if (_encoderTried) return null;

  _encoderTried = true;
  try {
    // require dinâmico para evitar issues de ESM/ciclos
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { get_encoding } = require("@dqbd/tiktoken");
    _encoder = get_encoding("cl100k_base");
  } catch {
    _encoder = null;
  }

  return _encoder;
}

/**
 * Conta tokens de forma robusta:
 * - Se @dqbd/tiktoken estiver disponível, usa encoder real (cl100k_base).
 * - Caso contrário, usa estimativa (≈ 4 chars por token).
 */
export function countTokens(text: string): number {
  const s = text || "";
  const encoder = getTokenEncoder();
  if (encoder) {
    return encoder.encode(s).length;
  }

  // fallback simples e rápido
  // (heurística comum: ~4 chars por token em inglês/pt)
  return Math.ceil(s.length / 4);
}

// -----------------------------
// Helpers menores (opcionais)
// -----------------------------

/** Junta pedaços ignorando vazios e aplicando trim nos itens. */
export function safeJoin(parts: Array<string | undefined | null>, sep = "\n\n") {
  return parts
    .map((p) => (p ?? "").toString().trim())
    .filter((p) => p.length > 0)
    .join(sep);
}

/** Clamp numérico simples. */
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/** Trim seguro que aceita undefined/null */
export const safeTrim = (s?: string | null) => (s ?? "").trim();
