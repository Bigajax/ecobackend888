import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export class SupabaseConfigError extends Error {
  constructor(public details: Record<string, unknown> = {}) {
    super("Supabase admin client is not configured. Missing envs.");
    this.name = "SupabaseConfigError";
  }
}

export function ensureSupabaseConfigured(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new SupabaseConfigError({
      hasUrl: Boolean(url),
      hasServiceKey: Boolean(key),
    });
  }
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}

export function tryGetAdmin(): SupabaseClient | null {
  try {
    return ensureSupabaseConfigured();
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return tryGetAdmin() !== null;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  return tryGetAdmin();
}

const lazySupabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = ensureSupabaseConfigured() as any;
      const value = client[prop];
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    },
    apply(_target, thisArg, argArray) {
      const client = ensureSupabaseConfigured() as any;
      return client.apply(thisArg, argArray as unknown[]);
    },
  }
) as SupabaseClient;

export const supabase = lazySupabase;

export default lazySupabase;
