// server/bootstrap/cors.ts
import cors from "cors";

/** ============================
 *  ORIGENS CONHECIDAS
 *  ============================ */
const PROD_ORIGINS = [
  "https://ecofrontend888.vercel.app",
  // Permite domínios de preview Vercel (builds temporários)
  "https://ecofrontend888-geviqh5x7-rafaels-projects-f3ef53c3.vercel.app",
] as const;

const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

/** ============================
 *  HELPERS
 *  ============================ */
const toOriginKey = (origin: string) => {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return origin.trim().toLowerCase();
  }
};

const resolveHostname = (origin: string) => {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return origin.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() ?? "";
  }
};

/** ============================
 *  LISTAS ESTÁTICAS E AMBIENTE
 *  ============================ */
const EXTRA_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const STATIC_ALLOW_LIST = new Set<string>(
  [...PROD_ORIGINS, ...LOCAL_ORIGINS, ...EXTRA_ORIGINS].map(toOriginKey)
);

const VERCEL_SUFFIX = ".vercel.app";

/** ============================
 *  CONFIG BÁSICA
 *  ============================ */
export const ALLOWED_METHODS = ["GET", "POST", "OPTIONS", "HEAD"] as const;

export const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "Accept",
  "Origin",
  "X-Requested-With",
  "X-Guest-Id",
  "X-Guest-Mode",
  "X-Title",
  "HTTP-Referer",
  // Alguns proxies verificam estes no preflight
  "User-Agent",
  "Sec-Fetch-Mode",
  "Sec-Fetch-Site",
  "Sec-Fetch-Dest",
] as const;

export const EXPOSE_HEADERS = [
  "X-Guest-Id",
  "Content-Type",
  "Cache-Control",
] as const;

/** ============================
 *  CHECAGEM DE ORIGIN
 *  ============================ */
export const allowList = STATIC_ALLOW_LIST;

export const isAllowedOrigin = (origin?: string | null): boolean => {
  // Permite chamadas sem Origin (ex: curl, apps nativos, extensões)
  if (!origin) return true;

  const normalized = toOriginKey(origin);
  if (allowList.has(normalized)) return true;

  const hostname = resolveHostname(origin);
  if (hostname && hostname.endsWith(VERCEL_SUFFIX)) return true;

  return false;
};

/** ============================
 *  MIDDLEWARE DE CORS
 *  ============================ */
export const corsMiddleware = cors({
  origin(origin, callback) {
    const ok = isAllowedOrigin(origin);
    if (ok) {
      if (process.env.ECO_DEBUG === "1") {
        console.debug(`[CORS] ✅ Allow: ${origin || "<sem origin>"}`);
      }
      callback(null, true);
    } else {
      console.warn(`[CORS] ❌ Blocked origin: ${origin || "<desconhecido>"}`);
      callback(new Error("CORS não permitido para este domínio"));
    }
  },
  credentials: true,
  methods: [...ALLOWED_METHODS],
  allowedHeaders: [...ALLOWED_HEADERS],
  exposedHeaders: [...EXPOSE_HEADERS],
  // cache do preflight por 20 min
  maxAge: 1200,
  optionsSuccessStatus: 204,
});
