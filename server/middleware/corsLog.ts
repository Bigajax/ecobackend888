import type { NextFunction, Request, Response } from "express";

export function corsLog(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS" || req.path.includes("ask-eco")) {
    console.info("[CORS] check", {
      method: req.method,
      path: req.path,
      origin: req.headers.origin,
      acrMethod: req.headers["access-control-request-method"],
      acrHeaders: req.headers["access-control-request-headers"],
    });
  }
  next();
}
