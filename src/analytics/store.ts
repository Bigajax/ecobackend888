import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) {
    return client;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("[analytics] missing_supabase_credentials");
    return null;
  }

  client = createClient<any, "analytics">(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "analytics" },
  }) as unknown as SupabaseClient;

  return client;
}

async function executeInsert<T>(table: string, payload: T | T[]): Promise<void> {
  const supabase = getClient();
  if (!supabase) {
    return;
  }

  const rows = Array.isArray(payload) ? payload : [payload];
  if (rows.length === 0) {
    return;
  }

  try {
    const { error } = await supabase.from(table).insert(rows as any);
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error(`[analytics] insert_failed:${table}`, error);
  }
}

export interface RespostaQRecord {
  response_id?: string;
  user_id?: string;
  retrieve_mode?: "FAST" | "DEEP";
  q: number;
  estruturado_ok: boolean;
  memoria_ok: boolean;
  bloco_ok: boolean;
  tokens_total?: number;
  tokens_aditivos?: number;
  ttfb_ms?: number;
  ttlc_ms?: number;
}

export async function insertRespostaQ(record: RespostaQRecord): Promise<void> {
  await executeInsert("resposta_q", record);
}

export interface ModuleOutcomeRecord {
  response_id?: string;
  module_id: string;
  tokens?: number;
  q: number;
  vpt?: number | null;
}

export async function insertModuleOutcomes(records: ModuleOutcomeRecord[]): Promise<void> {
  if (!records || records.length === 0) {
    return;
  }
  await executeInsert("module_outcomes", records);
}

export interface BanditRewardRecord {
  response_id?: string;
  pilar: "Linguagem" | "Encerramento" | "Modulacao";
  arm: "full" | "mini" | "rules";
  recompensa: number;
}

export async function insertBanditRewards(records: BanditRewardRecord[]): Promise<void> {
  if (!records || records.length === 0) {
    return;
  }
  await executeInsert("bandit_rewards", records);
}

export interface KnapsackDecisionRecord {
  response_id?: string;
  budget: number;
  adotados: any;
  ganho_estimado: number;
  tokens_aditivos: number;
}

export async function insertKnapsackDecision(record: KnapsackDecisionRecord): Promise<void> {
  await executeInsert("knapsack_decision", record);
}

export interface LatencySampleRecord {
  response_id?: string;
  ttfb_ms?: number;
  ttlc_ms?: number;
  tokens_total?: number;
}

export async function insertLatencySample(record: LatencySampleRecord): Promise<void> {
  await executeInsert("latency_samples", record);
}
