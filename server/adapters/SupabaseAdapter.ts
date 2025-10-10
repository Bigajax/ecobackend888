import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AnySupabase = SupabaseClient<any, any, any>;

export function supabaseWithBearer(accessToken: string): AnySupabase {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL ou SUPABASE_ANON_KEY ausentes; funcionalidades de memória indisponíveis."
    );
  }

  return createClient(
    url,
    anonKey,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  ) as AnySupabase;
}
