"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const prepareQueryEmbedding_1 = require("../../services/prepareQueryEmbedding");
const embeddingService = __importStar(require("../../adapters/embeddingService"));
const tests = [];
function test(name, run) {
    tests.push({ name, run });
}
test("normalizes direct user embeddings", async () => {
    const result = await (0, prepareQueryEmbedding_1.prepareQueryEmbedding)({ userEmbedding: [3, 4] });
    strict_1.default.ok(result, "embedding should be returned");
    const norm = Math.hypot(...result);
    strict_1.default.ok(Math.abs(norm - 1) < 1e-9, "result should be unit length");
    strict_1.default.ok(Math.abs(result[0] / result[1] - 0.75) < 1e-12);
});
test("accepts stringified embeddings", async () => {
    const result = await (0, prepareQueryEmbedding_1.prepareQueryEmbedding)({ userEmbedding: "[1, 2, 2]" });
    strict_1.default.ok(result);
    strict_1.default.equal(result.length, 3);
    strict_1.default.ok(Math.abs(Math.hypot(...result) - 1) < 1e-9);
});
test("delegates to embedTextoCompleto with tag", async () => {
    const calls = [];
    const original = embeddingService.embedTextoCompleto;
    embeddingService.embedTextoCompleto = async (texto, tag) => {
        calls.push({ texto, tag });
        return [0, 3, 4];
    };
    try {
        const result = await (0, prepareQueryEmbedding_1.prepareQueryEmbedding)({ texto: "  ola eco  ", tag: "refs" });
        strict_1.default.ok(result);
        strict_1.default.ok(Math.abs(Math.hypot(...result) - 1) < 1e-9);
        strict_1.default.deepEqual(calls, [{ texto: "ola eco", tag: "refs" }]);
    }
    finally {
        embeddingService.embedTextoCompleto = original;
    }
});
test("returns null on invalid embeddings", async () => {
    const original = embeddingService.embedTextoCompleto;
    embeddingService.embedTextoCompleto = async () => [1, Number.NaN];
    try {
        const result = await (0, prepareQueryEmbedding_1.prepareQueryEmbedding)({ texto: "texto" });
        strict_1.default.equal(result, null);
    }
    finally {
        embeddingService.embedTextoCompleto = original;
    }
});
(async () => {
    let failures = 0;
    for (const { name, run } of tests) {
        try {
            await run();
            console.log(`✓ ${name}`);
        }
        catch (error) {
            failures += 1;
            console.error(`✗ ${name}`);
            console.error(error);
        }
    }
    if (failures > 0) {
        console.error(`${failures} test(s) failed.`);
        process.exitCode = 1;
    }
    else {
        console.log(`All ${tests.length} test(s) passed.`);
    }
})();
//# sourceMappingURL=prepareQueryEmbedding.test.js.map