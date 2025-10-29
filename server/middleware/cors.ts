import type { NextFunction, Request, Response } from "express";

const ALLOW_EXACT = new Set<string>([
  "https://ecofrontend888.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
]);

const EXPOSE_HEADERS = "Content-Type, X-Request-Id, X-Eco-Interaction-Id";

function originAllowed(origin?: string | null): boolean {
  if (!origin) return false;
  if (ALLOW_EXACT.has(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin?: string | null): boolean {
  return originAllowed(origin);
}

function applyAllowedHeaders(res: Response, origin: string) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, X-Client-Message-Id, X-Eco-User-Id, X-Eco-Guest-Id, X-Eco-Session-Id"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS);
}

function maybeApplyCors(req: Request, res: Response) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (originAllowed(origin)) {
    applyAllowedHeaders(res, origin!);
  }
}

export function ecoCors(req: Request, res: Response, next: NextFunction) {
  maybeApplyCors(req, res);
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
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
