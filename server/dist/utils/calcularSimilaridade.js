"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularSimilaridade = calcularSimilaridade;
function calcularSimilaridade(v1, v2) {
    if (!v1 || !v2 || v1.length !== v2.length)
        return 0;
    const dot = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
    const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
    return mag1 && mag2 ? dot / (mag1 * mag2) : 0;
}
//# sourceMappingURL=calcularSimilaridade.js.map