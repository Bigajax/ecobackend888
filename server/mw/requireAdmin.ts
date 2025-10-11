import type { Request, Response, NextFunction } from "express";
import { ensureSupabaseConfigured, SupabaseConfigError } from "../lib/supabaseAdmin";

declare module "express-serve-static-core" {
  interface Request {
    admin?: ReturnType<typeof ensureSupabaseConfigured>;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    req.admin = ensureSupabaseConfigured();
    return next();
  } catch (err) {
    const e = err as Error;
    return res.status(500).json({
      error: "SUPABASE_ADMIN_NOT_CONFIGURED",
      message: e.message,
    });
  }
}

export default requireAdmin;
