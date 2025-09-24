// server/services/promptContext/logger.ts

type L = "error" | "warn" | "info" | "debug" | "trace";
const levels: Record<L, number> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

// ---------- Nível vindo do ambiente ----------
const levelEnv = (process.env.ECO_LOG_LEVEL ?? "info").toLowerCase();
const current: number =
  (levels as Record<string, number>)[levelEnv] != null
    ? (levels as Record<string, number>)[levelEnv]
    : levels.info;

// Se ECO_DEBUG=1, eleva o nível efetivo para pelo menos "debug"
const forceDebug = process.env.ECO_DEBUG === "1";
const effective: number = forceDebug && current < levels.debug ? levels.debug : current;

// Exponho helpers úteis
export const getLogLevel = (): L => {
  // pega a primeira chave cujo valor == effective (fallback para "info")
  const found = (Object.keys(levels) as L[]).find(k => levels[k] === effective);
  return found ?? "info";
};
export const isDebug = () => effective >= levels.debug;

// ---------- Serialização segura ----------
/** JSON.stringify seguro p/ objetos com ciclos, Map/Set, Error etc. */
function safeStringify(v: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    v,
    (_k, val: unknown) => {
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
        if (seen.has(val)) return "[Circular]";
        seen.add(val as object);
      }
      return val as any;
    },
    0
  );
}

/** Normaliza args para o console (evita [object Object] em agregadores). */
function fmtArg(a: unknown): string {
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
      } catch {
        return String(a);
      }
  }
}

function out(l: L, contextPrefix: string | null, args: unknown[]) {
  // usa o nível EFETIVO (respeita ECO_DEBUG=1)
  if (levels[l] > effective) return;
  const ts = new Date().toISOString();
  const head = `[${ts}] [${l.toUpperCase()}]${contextPrefix ? ` ${contextPrefix}` : ""}`;
  // Render combina stdout/stderr → padronizamos console.log
  const body = args.map(fmtArg).join(" ");
  console.log(head, body);
}

type LogAPI = {
  error: (...a: unknown[]) => void;
  warn:  (...a: unknown[]) => void;
  info:  (...a: unknown[]) => void;
  debug: (...a: unknown[]) => void;
  trace: (...a: unknown[]) => void;
  /** Cria um logger com contexto fixo (prefixo), ex.: log.withContext("ContextBuilder") */
  withContext: (ctx: string | Record<string, unknown>) => LogAPI;
};

function ctxToPrefix(ctx: string | Record<string, unknown>): string {
  if (typeof ctx === "string") return `[${ctx}]`;
  const name = (ctx as any)?.name;
  return name ? `[${String(name)}]` : `[ctx=${safeStringify(ctx)}]`;
}

function makeLogger(context: string | Record<string, unknown> | null = null): LogAPI {
  const prefix = context ? ctxToPrefix(context) : null;
  return {
    error: (...a: unknown[]) => out("error", prefix, a),
    warn:  (...a: unknown[]) => out("warn",  prefix, a),
    info:  (...a: unknown[]) => out("info",  prefix, a),
    debug: (...a: unknown[]) => out("debug", prefix, a),
    trace: (...a: unknown[]) => out("trace", prefix, a),
    withContext: (ctx) => makeLogger(ctx),
  };
}

// Logger padrão (sem contexto)
export const log: LogAPI = makeLogger();
