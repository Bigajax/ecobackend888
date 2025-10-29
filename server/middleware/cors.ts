import type { NextFunction, Request, Response } from "express";

const ALLOW_EXACT = new Set<string>([
  "https://ecofrontend888.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
]);

const ALLOW_HEADERS =
  "Content-Type, Accept, X-Client-Message-Id, X-Eco-User-Id, X-Eco-Guest-Id, X-Eco-Session-Id";
const ALLOW_METHODS = "GET,POST,OPTIONS";
const EXPOSE_HEADERS = "Content-Type, X-Request-Id, X-Eco-Interaction-Id";

function setVaryHeader(res: Response, value: string) {
  const existing = res.getHeader("Vary");
  if (!existing) {
    res.setHeader("Vary", value);
    return;
  }

  const normalized = (Array.isArray(existing) ? existing : String(existing))
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);

  if (!normalized.includes(value)) {
    normalized.push(value);
    res.setHeader("Vary", normalized.join(", "));
  }
}

export function isAllowedOrigin(origin?: string | null): boolean {
  if (!origin) return false;
  if (ALLOW_EXACT.has(origin)) return true;

  try {
    const parsed = new URL(origin);
    return parsed.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function applyAllowedHeaders(res: Response, origin: string) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
  res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
  res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS);
  setVaryHeader(res, "Origin");
}

function maybeApplyCors(req: Request, res: Response) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (isAllowedOrigin(origin)) {
    applyAllowedHeaders(res, origin!);
  }
}

export function ecoCors(req: Request, res: Response, next: NextFunction) {
  maybeApplyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
}

export function applyCorsResponseHeaders(req: Request, res: Response) {
  maybeApplyCors(req, res);
}

export function corsResponseInjector(req: Request, res: Response, next: NextFunction) {
  maybeApplyCors(req, res);
  next();
}

export const corsMiddleware = ecoCors;

export function getConfiguredCorsOrigins(): string[] {
  return [...ALLOW_EXACT, "*.vercel.app"];
}
