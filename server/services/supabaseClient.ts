import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { log } from "./promptContext/logger";

const logger = log.withContext("analytics-client");

const supabaseUrl = process.env.SUPABASE_URL ?? null;
const analyticsServiceRoleKey = process.env.SUPABASE_ANALYTICS_SERVICE_ROLE_KEY ?? null;
const serviceRoleFallbackKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
const isProduction = process.env.NODE_ENV === "production";

type AnalyticsClientMode = "service-role" | "fallback-service-role" | "disabled";

let resolvedMode: AnalyticsClientMode = "disabled";
let resolvedKey: string | null = null;

if (!supabaseUrl) {
  logger.error("analytics.supabase.missing_url", { env: "SUPABASE_URL" });
} else if (analyticsServiceRoleKey) {
  resolvedKey = analyticsServiceRoleKey;
  resolvedMode = "service-role";
} else if (!isProduction && serviceRoleFallbackKey) {
  resolvedKey = serviceRoleFallbackKey;
  resolvedMode = "fallback-service-role";
  logger.warn("analytics.supabase.fallback_service_role", { env: "SUPABASE_SERVICE_ROLE_KEY" });
} else {
  resolvedMode = "disabled";
  const missingEnv = isProduction
    ? "SUPABASE_ANALYTICS_SERVICE_ROLE_KEY"
    : "SUPABASE_ANALYTICS_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY";
  logger.error("analytics.supabase.missing_service_role", { env: missingEnv, isProduction });
}

let supabaseInstance: SupabaseClient | null = null;

if (supabaseUrl && resolvedKey) {
  supabaseInstance = createClient(supabaseUrl, resolvedKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
