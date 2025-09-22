import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AnySupabase = SupabaseClient<any, any, any>;

export function supabaseWithBearer(accessToken: string): AnySupabase {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  ) as AnySupabase;
}
