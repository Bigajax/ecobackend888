"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareQueryEmbedding = prepareQueryEmbedding;
exports.coerceToNumberArray = coerceToNumberArray;
const embeddingService_1 = require("../adapters/embeddingService");
function coerceToNumberArray(value) {
    let arr = null;
    if (Array.isArray(value)) {
        arr = value;
    }
    else if (ArrayBuffer.isView(value) && typeof value.length === "number") {
        arr = Array.from(value);
    }
    else {
        try {
            const parsed = JSON.parse(String(value));
            if (Array.isArray(parsed))
                arr = parsed;
        }
        catch {
            arr = null;
        }
    }
    if (!arr)
        return null;
    const nums = arr.map((x) => Number(x));
    if (nums.length < 2)
        return null;
    if (nums.some((n) => !Number.isFinite(n)))
        return null;
    return nums;
}
async function prepareQueryEmbedding(input) {
    const { texto, userEmbedding, tag } = input;
    if (userEmbedding != null) {
        const coerced = coerceToNumberArray(userEmbedding);
        return coerced ? (0, embeddingService_1.unitNorm)(coerced) : null;
    }
    const normalizedTexto = texto?.trim();
    if (!normalizedTexto)
        return null;
    const raw = await (0, embeddingService_1.embedTextoCompleto)(normalizedTexto, tag);
    const coerced = coerceToNumberArray(raw);
    return coerced ? (0, embeddingService_1.unitNorm)(coerced) : null;
}
//# sourceMappingURL=prepareQueryEmbedding.js.map