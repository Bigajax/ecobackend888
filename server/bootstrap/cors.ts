// server/bootstrap/cors.ts
import cors from "cors";

/** ============================
 *  ORIGENS CONHECIDAS
 *  ============================ */
const PROD_ORIGINS = ["https://ecofrontend888.vercel.app"] as const;

const LOCAL_ORIGINS = ["http://localhost:5173"] as const;

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

/** ============================
 *  LISTAS ESTÁTICAS E AMBIENTE
 *  ============================ */
const EXTRA_ORIGINS: string[] = [];

const STATIC_ALLOW_LIST = new Set<string>(
  [...PROD_ORIGINS, ...LOCAL_ORIGINS, ...EXTRA_ORIGINS].map(toOriginKey)
);

/** ============================
 *  CONFIG BÁSICA
 *  ============================ */
export const ALLOWED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

export const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Guest-Id",
  "X-Requested-With",
  "Accept",
  "Accept-Language",
  "Cache-Control",
  "Pragma",
  "Range",
] as const;

export const EXPOSE_HEADERS = [
  "content-encoding",
  "content-type",
  "content-length",
  "range",
  "content-range",
] as const;

export const ALLOWED_METHODS_HEADER = ALLOWED_METHODS.join(", ");
export const ALLOWED_HEADERS_HEADER = ALLOWED_HEADERS.join(", ");
export const EXPOSE_HEADERS_HEADER = EXPOSE_HEADERS.join(", ");
export const PREFLIGHT_MAX_AGE_SECONDS = 600;

/** ============================
 *  CHECAGEM DE ORIGIN
 *  ============================ */
export const allowList = STATIC_ALLOW_LIST;

export const isAllowedOrigin = (origin?: string | null): boolean => {
  if (!origin) return true;

  const normalized = toOriginKey(origin);
  return allowList.has(normalized);
};

/** ============================
 *  MIDDLEWARE DE CORS
 *  ============================ */
export const CORS_ALLOW_CREDENTIALS = true;

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
  credentials: CORS_ALLOW_CREDENTIALS,
  methods: [...ALLOWED_METHODS],
  allowedHeaders: [...ALLOWED_HEADERS],
  exposedHeaders: [...EXPOSE_HEADERS],
  // cache do preflight por 10 min
  maxAge: 600,
  optionsSuccessStatus: 204,
});
