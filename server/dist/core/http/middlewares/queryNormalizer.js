"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeQuery = normalizeQuery;
function normalizeQuery(req, _res, next) {
    const q = req.query;
    if (q && q.limite != null && q.limit == null)
        q.limit = q.limite;
    next();
}
//# sourceMappingURL=queryNormalizer.js.map