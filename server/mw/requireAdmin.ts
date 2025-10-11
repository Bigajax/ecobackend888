import type { Request, Response, NextFunction } from "express";
import {
  ensureSupabaseConfigured,
  SupabaseConfigError,
} from "../lib/supabaseAdmin";

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
    if (err instanceof SupabaseConfigError) {
      return res.status(500).json({
        error: "Supabase admin client is not configured.",
        details: err.details,
      });
    }

    console.error("[requireAdmin] Failed to instantiate Supabase admin", err);
    return res.status(500).json({ error: "Erro interno ao inicializar Supabase." });
  }
}

export default requireAdmin;
