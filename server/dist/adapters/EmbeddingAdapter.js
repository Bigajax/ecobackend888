"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashText = hashText;
exports.getEmbeddingCached = getEmbeddingCached;
const crypto_1 = __importDefault(require("crypto"));
const embeddingService_1 = require("./embeddingService"); // <- seu serviço existente
const CacheService_1 = require("../services/CacheService");
function hashText(text) {
    return crypto_1.default.createHash("md5").update((text || "").trim().toLowerCase()).digest("hex");
}
async function getEmbeddingCached(text, tipo) {
    if (!text?.trim())
        return [];
    const hash = hashText(text);
    const cached = CacheService_1.embeddingCache.get(hash);
    if (cached) {
        console.log(`🎯 Cache hit para embedding (${tipo})`);
        return cached;
    }
    const emb = await (0, embeddingService_1.embedTextoCompleto)(text, tipo);
    if (emb?.length)
        CacheService_1.embeddingCache.set(hash, emb);
    return emb;
}
//# sourceMappingURL=EmbeddingAdapter.js.map