import type { Request, Response, NextFunction } from "express";

export function normalizeQuery(req: Request, _res: Response, next: NextFunction) {
  const q = req.query as Record<string, any>;
  if (q && q.limite != null && q.limit == null) q.limit = q.limite;
  next();
}
