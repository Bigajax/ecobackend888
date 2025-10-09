import cors from "cors";

const PROD_ORIGINS = ["https://ecofrontend888.vercel.app"] as const;
const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

const toOriginKey = (origin: string) => {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return origin.trim().toLowerCase();
  }
};

const EXTRA_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const STATIC_ALLOW_LIST = new Set<string>(
  [...PROD_ORIGINS, ...LOCAL_ORIGINS, ...EXTRA_ORIGINS].map(toOriginKey)
);

const vercelAppSuffix = ".vercel.app";

const resolveHostname = (origin: string) => {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return origin.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() ?? "";
  }
};

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
] as const;

export const allowList = STATIC_ALLOW_LIST;

export const isAllowedOrigin = (origin?: string | null): boolean => {
  if (!origin) return true;

  const normalized = toOriginKey(origin);
  if (allowList.has(normalized)) {
    return true;
  }

  const hostname = resolveHostname(origin);
  if (hostname && hostname.endsWith(vercelAppSuffix)) {
    return true;
  }

  return false;
};

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    if (origin) {
      console.warn(`[CORS] Bloqueado origin: ${origin}`);
    } else {
      console.warn("[CORS] Bloqueado origin: <desconhecido>");
    }

    callback(new Error("CORS não permitido para este domínio"));
  },
  credentials: true,
  methods: [...ALLOWED_METHODS],
  allowedHeaders: [...ALLOWED_HEADERS],
  optionsSuccessStatus: 204,
});
