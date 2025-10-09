import type { NextFunction, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";

declare module "express-serve-static-core" {
  interface Request {
    supabaseAdmin?: SupabaseClient;
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const client = ensureSupabaseConfigured();
    req.supabaseAdmin = client;
    next();
  } catch (error) {
    res.status(500).json({
      type: "about:blank",
      title: "Admin configuration missing",
      detail: "SUPABASE_URL ou SERVICE_ROLE ausentes no servidor.",
      status: 500,
    });
  }
}

export default requireAdmin;
