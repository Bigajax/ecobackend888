"use strict";
// server/services/promptContext/logger.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = exports.isDebug = exports.getLogLevel = void 0;
const levels = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
// ---------- Nível vindo do ambiente ----------
const levelEnv = (process.env.ECO_LOG_LEVEL ?? "info").toLowerCase();
const current = levels[levelEnv] != null
    ? levels[levelEnv]
    : levels.info;
// Se ECO_DEBUG=1, eleva o nível efetivo para pelo menos "debug"
const forceDebug = process.env.ECO_DEBUG === "1";
const effective = forceDebug && current < levels.debug ? levels.debug : current;
// Exponho helpers úteis
const getLogLevel = () => {
    // pega a primeira chave cujo valor == effective (fallback para "info")
    const found = Object.keys(levels).find(k => levels[k] === effective);
    return found ?? "info";
};
exports.getLogLevel = getLogLevel;
const isDebug = () => effective >= levels.debug;
exports.isDebug = isDebug;
// ---------- Serialização segura ----------
/** JSON.stringify seguro p/ objetos com ciclos, Map/Set, Error etc. */
function safeStringify(v) {
    const seen = new WeakSet();
    return JSON.stringify(v, (_k, val) => {
        if (val instanceof Error) {
            return { name: val.name, message: val.message, stack: val.stack };
        }
        if (val instanceof Map) {
            return Object.fromEntries(val);
        }
        if (val instanceof Set) {
            return Array.from(val);
        }
        if (typeof val === "object" && val !== null) {
            if (seen.has(val))
                return "[Circular]";
            seen.add(val);
        }
        return val;
    }, 0);
}
/** Normaliza args para o console (evita [object Object] em agregadores). */
function fmtArg(a) {
    switch (typeof a) {
        case "string":
            return a;
        case "number":
        case "boolean":
            return String(a);
        case "undefined":
            return "undefined";
        default:
            try {
                return safeStringify(a);
            }
            catch {
                return String(a);
            }
    }
}
function out(l, contextPrefix, args) {
    // usa o nível EFETIVO (respeita ECO_DEBUG=1)
    if (levels[l] > effective)
        return;
    const ts = new Date().toISOString();
    const head = `[${ts}] [${l.toUpperCase()}]${contextPrefix ? ` ${contextPrefix}` : ""}`;
    // Render combina stdout/stderr → padronizamos console.log
    const body = args.map(fmtArg).join(" ");
    console.log(head, body);
}
function ctxToPrefix(ctx) {
    if (typeof ctx === "string")
        return `[${ctx}]`;
    const name = ctx?.name;
    return name ? `[${String(name)}]` : `[ctx=${safeStringify(ctx)}]`;
}
function makeLogger(context = null) {
    const prefix = context ? ctxToPrefix(context) : null;
    return {
        error: (...a) => out("error", prefix, a),
        warn: (...a) => out("warn", prefix, a),
        info: (...a) => out("info", prefix, a),
        debug: (...a) => out("debug", prefix, a),
        trace: (...a) => out("trace", prefix, a),
        withContext: (ctx) => makeLogger(ctx),
    };
}
// Logger padrão (sem contexto)
exports.log = makeLogger();
//# sourceMappingURL=logger.js.map