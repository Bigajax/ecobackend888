import type { NextFunction, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, getSupabaseConfigError } from "../lib/supabaseAdmin";

declare module "express-serve-static-core" {
  interface Request {
    supabaseAdmin?: SupabaseClient;
    supabaseAdminError?: Error;
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const client = getSupabaseAdmin();
  if (client) {
    req.supabaseAdmin = client;
  } else {
    const configurationError = getSupabaseConfigError();
    if (configurationError) {
      req.supabaseAdminError = configurationError;
    }
  }

  next();
}

export default requireAdmin;
