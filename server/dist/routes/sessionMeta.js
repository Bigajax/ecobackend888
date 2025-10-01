"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSessionMeta = extractSessionMeta;
const pickString = (...values) => {
    for (const value of values) {
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
};
const pickNullableString = (...values) => {
    const picked = pickString(...values);
    return picked ?? undefined;
};
const possibleContainers = [
    "sessionMeta",
    "session_meta",
    "session",
    "sessaoMeta",
    "sessao_meta",
    "sessao",
    "metaSessao",
    "meta_sessao",
    "metadadosSessao",
    "metadados_sessao",
    "metadata",
];
function extractSessionMeta(payload) {
    if (!payload || typeof payload !== "object")
        return undefined;
    let container;
    for (const key of possibleContainers) {
        const value = payload[key];
        if (value && typeof value === "object") {
            container = value;
            break;
        }
    }
    const source = container ?? payload;
    const distinctId = pickString(source.distinctId, source.distinct_id, source.distinctID, source.mpDistinctId, payload.distinctId, payload.distinct_id);
    const versaoApp = pickNullableString(source.versaoApp, source.versao_app, source.appVersion);
    const device = pickNullableString(source.device, source.dispositivo, source.device_name);
    const ambiente = pickNullableString(source.ambiente, source.environment, source.env);
    const sessaoId = pickNullableString(source.sessaoId, source.sessionId, source.sessao_id, source.session_id, payload.sessaoId, payload.sessao_id);
    const origem = pickNullableString(source.origem, source.origin, source.source, payload.origem, payload.origin, payload.source);
    const hasAny = distinctId || versaoApp || device || ambiente || sessaoId || origem;
    if (!hasAny)
        return undefined;
    return {
        distinctId,
        versaoApp: versaoApp ?? null,
        device: device ?? null,
        ambiente: ambiente ?? null,
        ...(sessaoId !== undefined ? { sessaoId } : {}),
        ...(origem !== undefined ? { origem } : {}),
    };
}
//# sourceMappingURL=sessionMeta.js.map