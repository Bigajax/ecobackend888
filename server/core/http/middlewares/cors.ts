import cors from "cors";
import type { Express, Response, Request, NextFunction } from "express";

const defaultAllow = [
  "https://ecofrontend888.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const vercelRegex = /^https?:\/\/([a-z0-9-]+)\.vercel\.app$/i;

function buildAllowList() {
  const extraAllow = (process.env.CORS_ALLOW_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return new Set<string>([...defaultAllow, ...extraAllow]);
}

const allowList = buildAllowList();

export const corsOptions: cors.CorsOptions = {
  origin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return cb(null, true);
    if (allowList.has(origin) || vercelRegex.test(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

export function applyCors(app: Express) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
    next();
  });
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
}

export function ensureCorsHeaders(res: Response, origin?: string | null) {
  if (origin && (allowList.has(origin) || vercelRegex.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export function getAllowList() {
  return allowList;
}

export { vercelRegex };
