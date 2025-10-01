"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.__internal = exports.extractDistinctId = exports.extractRelatorioView = exports.DEFAULT_RELATORIO_VIEW = void 0;
const RELATORIO_VIEWS = ["mapa", "linha_do_tempo"];
const VALID_VIEWS = new Set(RELATORIO_VIEWS);
exports.DEFAULT_RELATORIO_VIEW = "mapa";
const POSSIBLE_VIEW_HEADER_KEYS = [
    "x-relatorio-view",
    "x-relatorio-emocional-view",
    "x-view",
    "view",
];
const POSSIBLE_DISTINCT_ID_QUERY_KEYS = ["distinctId", "distinct_id", "distinctID"];
const POSSIBLE_DISTINCT_ID_HEADER_KEYS = [
    "x-mixpanel-distinct-id",
    "x-mp-distinct-id",
    "distinct-id",
    "distinctid",
    "distinct",
];
const pickFirstString = (value) => {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value)) {
        const [first] = value;
        if (typeof first === "string")
            return first;
    }
    return undefined;
};
const extractRelatorioView = (req) => {
    const queryValue = pickFirstString(req.query?.view);
    const normalizedQuery = queryValue?.trim().toLowerCase();
    if (normalizedQuery && VALID_VIEWS.has(normalizedQuery)) {
        return normalizedQuery;
    }
    for (const key of POSSIBLE_VIEW_HEADER_KEYS) {
        const headerValue = pickFirstString(req.headers[key]);
        const normalized = headerValue?.trim().toLowerCase();
        if (normalized && VALID_VIEWS.has(normalized)) {
            return normalized;
        }
    }
    return exports.DEFAULT_RELATORIO_VIEW;
};
exports.extractRelatorioView = extractRelatorioView;
const extractDistinctId = (req) => {
    for (const key of POSSIBLE_DISTINCT_ID_QUERY_KEYS) {
        const candidate = pickFirstString(req.query?.[key]);
        if (candidate && candidate.trim())
            return candidate.trim();
    }
    for (const key of POSSIBLE_DISTINCT_ID_HEADER_KEYS) {
        const candidate = pickFirstString(req.headers[key]);
        if (candidate && candidate.trim())
            return candidate.trim();
    }
    return undefined;
};
exports.extractDistinctId = extractDistinctId;
exports.__internal = {
    pickFirstString,
};
//# sourceMappingURL=relatorioEmocionalView.js.map