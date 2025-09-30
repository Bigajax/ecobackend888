import type { Request } from "express";

const RELATORIO_VIEWS = ["mapa", "linha_do_tempo"] as const;
export type RelatorioView = (typeof RELATORIO_VIEWS)[number];
const VALID_VIEWS = new Set<string>(RELATORIO_VIEWS);
export const DEFAULT_RELATORIO_VIEW: RelatorioView = "mapa";

const POSSIBLE_VIEW_HEADER_KEYS = [
  "x-relatorio-view",
  "x-relatorio-emocional-view",
  "x-view",
  "view",
] as const;

const POSSIBLE_DISTINCT_ID_QUERY_KEYS = ["distinctId", "distinct_id", "distinctID"] as const;
const POSSIBLE_DISTINCT_ID_HEADER_KEYS = [
  "x-mixpanel-distinct-id",
  "x-mp-distinct-id",
  "distinct-id",
  "distinctid",
  "distinct",
] as const;

const pickFirstString = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const [first] = value;
    if (typeof first === "string") return first;
  }
  return undefined;
};

export const extractRelatorioView = (req: Request): RelatorioView => {
  const queryValue = pickFirstString(req.query?.view);
  const normalizedQuery = queryValue?.trim().toLowerCase();
  if (normalizedQuery && VALID_VIEWS.has(normalizedQuery)) {
    return normalizedQuery as RelatorioView;
  }

  for (const key of POSSIBLE_VIEW_HEADER_KEYS) {
    const headerValue = pickFirstString(req.headers[key]);
    const normalized = headerValue?.trim().toLowerCase();
    if (normalized && VALID_VIEWS.has(normalized)) {
      return normalized as RelatorioView;
    }
  }

  return DEFAULT_RELATORIO_VIEW;
};

export const extractDistinctId = (req: Request): string | undefined => {
  for (const key of POSSIBLE_DISTINCT_ID_QUERY_KEYS) {
    const candidate = pickFirstString((req.query as Record<string, unknown> | undefined)?.[key]);
    if (candidate && candidate.trim()) return candidate.trim();
  }

  for (const key of POSSIBLE_DISTINCT_ID_HEADER_KEYS) {
    const candidate = pickFirstString(req.headers[key]);
    if (candidate && candidate.trim()) return candidate.trim();
  }

  return undefined;
};

export const __internal = {
  pickFirstString,
};
