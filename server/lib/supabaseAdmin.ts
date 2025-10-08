// server/lib/supabaseAdmin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { log as baseLog } from "../services/promptContext/logger";

const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET ||
  process.env.SUPABASE_KEY ||
  "";

const missingVars = [
  !url ? "SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL)" : null,
  !serviceKey
    ? "SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET/SUPABASE_KEY)"
    : null,
].filter(Boolean);

const configurationError =
  missingVars.length > 0
    ? new Error(
        `Supabase admin não configurado: defina ${missingVars.join(
          ", "
        )} nas variáveis de ambiente.`
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
const logger = baseLog.withContext({
  name: "supabaseAdmin",
  service: "lib/supabaseAdmin",
});

export const supabase: SupabaseClient = configurationError
  ? createErrorProxy<SupabaseClient>(configurationError)
  : createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

if (configurationError && process.env.NODE_ENV !== "test") {
  const env = process.env.NODE_ENV || "development";
  console.warn(`[supabaseAdmin] ${configurationError.message}`);
  logger.warn("Supabase admin misconfiguration", {
    env,
    missingVars,
  });
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
