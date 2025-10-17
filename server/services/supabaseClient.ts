import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { log } from "./promptContext/logger";

const logger = log.withContext("analytics-client");

const supabaseUrl = process.env.SUPABASE_URL ?? null;
const explicitAnalyticsKey = process.env.SUPABASE_ANALYTICS_SERVICE_ROLE_KEY ?? null;
const serviceRoleKey = explicitAnalyticsKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

type AnalyticsClientMode = "enabled" | "disabled";

let resolvedMode: AnalyticsClientMode = "disabled";
let supabaseInstance: SupabaseClient | null = null;

if (!supabaseUrl) {
  logger.error("analytics.supabase.missing_url", { env: "SUPABASE_URL" });
} else if (!serviceRoleKey) {
  logger.error("analytics.supabase.missing_service_role", {
    env: "SUPABASE_SERVICE_ROLE_KEY",
  });
} else {
  supabaseInstance = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client": "eco-analytics" } },
  });
  resolvedMode = "enabled";
}

const createAnalyticsClient = () => {
  if (!supabaseInstance) {
    throw new Error("Supabase analytics client is not configured.");
  }

  return supabaseInstance.schema("analytics");
};

type AnalyticsClient = ReturnType<typeof createAnalyticsClient>;

let analyticsClient: AnalyticsClient | null = null;

export const analyticsClientMode = resolvedMode;

export function getAnalyticsClient(): AnalyticsClient {
  if (!analyticsClient) {
    analyticsClient = createAnalyticsClient();
  }

  return analyticsClient;
}

export const supabase = supabaseInstance;
