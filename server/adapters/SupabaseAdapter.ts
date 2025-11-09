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

/**
 * Creates an anonymous Supabase client for guest sessions.
 * No authentication required - allows guests to insert into guest_sessions and guest_messages.
 */
export function supabaseForGuests(): AnySupabase {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL ou SUPABASE_ANON_KEY ausentes; funcionalidades de guest indisponíveis."
    );
  }

  return createClient(url, anonKey) as AnySupabase;
}
