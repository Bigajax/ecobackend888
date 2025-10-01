"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vercelRegex = exports.corsOptions = void 0;
exports.applyCors = applyCors;
exports.ensureCorsHeaders = ensureCorsHeaders;
exports.getAllowList = getAllowList;
const cors_1 = __importDefault(require("cors"));
const defaultAllow = [
    "https://ecofrontend888.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];
const vercelRegex = /^https?:\/\/([a-z0-9-]+)\.vercel\.app$/i;
exports.vercelRegex = vercelRegex;
function buildAllowList() {
    const extraAllow = (process.env.CORS_ALLOW_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return new Set([...defaultAllow, ...extraAllow]);
}
const allowList = buildAllowList();
exports.corsOptions = {
    origin(origin, cb) {
        if (!origin)
            return cb(null, true);
        if (allowList.has(origin) || vercelRegex.test(origin))
            return cb(null, true);
        return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    optionsSuccessStatus: 204,
    maxAge: 86400,
};
function applyCors(app) {
    app.use((req, res, next) => {
        res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
        next();
    });
    app.use((0, cors_1.default)(exports.corsOptions));
    app.options("*", (0, cors_1.default)(exports.corsOptions));
}
function ensureCorsHeaders(res, origin) {
    if (origin && (allowList.has(origin) || vercelRegex.test(origin))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }
}
function getAllowList() {
    return allowList;
}
//# sourceMappingURL=cors.js.map