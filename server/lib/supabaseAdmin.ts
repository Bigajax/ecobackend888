// server/lib/supabaseAdmin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { log as baseLog } from "../services/promptContext/logger";

const logger = baseLog.withContext("SupabaseAdmin");


const url = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const missingVars = [
  !url ? "SUPABASE_URL" : null,
  !serviceKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
].filter(Boolean) as string[];

const configurationError =
  missingVars.length > 0
    ? new Error(
        `Supabase admin não configurado: defina ${missingVars.join(", ")} nas variáveis de ambiente.`
      )
    : null;

const createErrorProxy = <T extends object>(error: Error): T =>
  new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "__configError__") return error;
        if (prop === "then") return undefined;
        if (prop === Symbol.toStringTag) return "SupabaseClient";
        if (prop === "toString") {
          return () => `[SupabaseAdminError: ${error.message}]`;
        }
        return createErrorProxy<any>(error);
      },
      apply: () => {
        throw error;
      },
    }
  ) as T;

/** Singleton do Supabase usando a Service Role Key (admin) */
export const supabase: SupabaseClient = configurationError
  ? createErrorProxy<SupabaseClient>(configurationError)
  : createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

if (configurationError && process.env.NODE_ENV !== "test") {
  const env = process.env.NODE_ENV || "development";
  const payload = {
    service: "supabaseAdmin",
    env,
    missingVars,
    timestamp: new Date().toISOString(),
  };
  console.warn("[supabaseAdmin] Missing configuration", payload);
  logger.warn("Supabase admin misconfiguration", payload);
}

export const isSupabaseConfigured = (): boolean => configurationError == null;

export const getSupabaseConfigError = (): Error | null => configurationError;

export const ensureSupabaseConfigured = (): SupabaseClient => {
  if (configurationError) {
    throw configurationError;
  }
  return supabase;
};

export const getSupabaseAdmin = (): SupabaseClient | null =>
  configurationError ? null : supabase;

// 🔐 Compatibilidade: permite `import supabase from "..."`
export default supabase;
