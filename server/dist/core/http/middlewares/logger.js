"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
const logger_1 = require("../../../services/promptContext/logger");
function requestLogger(req, _res, next) {
    logger_1.log.info(`Backend: [${req.method}] ${req.originalUrl} (Origin: ${req.headers.origin || "-"})`);
    next();
}
//# sourceMappingURL=logger.js.map