import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

function assertEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

type GenericClient = SupabaseClient<any, any, any>;

type InsertResult = Record<string, unknown>;

async function insertRows(
  client: GenericClient,
  table: string,
  payload: Record<string, unknown>[]
): Promise<InsertResult[]> {
  const { data, error } = await client.from(table).insert(payload).select();
  if (error) {
    throw new Error(`[${table}] insert failed: ${error.message}`);
  }
  return (data ?? []) as InsertResult[];
}

async function upsertRows(
  client: GenericClient,
  table: string,
  payload: Record<string, unknown>[]
): Promise<InsertResult[]> {
  const { data, error } = await client.from(table).upsert(payload).select();
  if (error) {
    throw new Error(`[${table}] upsert failed: ${error.message}`);
  }
  return (data ?? []) as InsertResult[];
}

async function seedAnalyticsTables(client: GenericClient): Promise<{
  responseId: string;
  userId: string;
}> {
  const responseId = randomUUID();
  const userId = randomUUID();

  const respostaRows = await insertRows(client, "resposta_q", [
    {
      response_id: responseId,
      user_id: userId,
      retrieve_mode: "FAST",
      q: 0.82,
      estruturado_ok: true,
      memoria_ok: true,
      bloco_ok: false,
      tokens_total: 480,
      tokens_aditivos: 120,
      ttfb_ms: 140,
      ttlc_ms: 860,
    },
  ]);
  console.log("[analytics] inserted resposta_q", respostaRows[0]);

  const moduleRows = await insertRows(client, "module_outcomes", [
    {
      response_id: responseId,
      module_id: "IDENTIDADE::v1",
      tokens: 60,
      q: 0.8,
      vpt: 0.013,
    },
    {
      response_id: responseId,
      module_id: "VIVA::v2",
      tokens: 30,
      q: 0.76,
      vpt: 0.025,
    },
  ]);
  console.log("[analytics] inserted module_outcomes", moduleRows.map((row) => row.id));

  const banditRows = await insertRows(client, "bandit_rewards", [
    {
      response_id: responseId,
      pilar: "Linguagem",
      arm: "full",
      recompensa: 0.72,
    },
    {
      response_id: responseId,
      pilar: "Encerramento",
      arm: "mini",
      recompensa: 0.54,
    },
  ]);
  console.log("[analytics] inserted bandit_rewards", banditRows.map((row) => row.id));

  const knapsackRows = await insertRows(client, "knapsack_decision", [
    {
      response_id: responseId,
      budget: 240,
      adotados: ["IDENTIDADE::v1", "VIVA::v2"],
      ganho_estimado: 0.41,
      tokens_aditivos: 90,
    },
  ]);
  console.log("[analytics] inserted knapsack_decision", knapsackRows[0]);

  const latencyRows = await insertRows(client, "latency_samples", [
    {
      response_id: responseId,
      ttfb_ms: 140,
      ttlc_ms: 860,
      tokens_total: 480,
    },
  ]);
  console.log("[analytics] inserted latency_samples", latencyRows[0]);

  const heuristicsRows = await insertRows(client, "heuristics_events", [
    {
      response_id: responseId,
      interaction_id: responseId,
      active_biases: [
        {
          bias: "bias:ancoragem",
          confidence: 0.72,
          decay_applied: false,
          source: "legacy",
          last_seen_at: new Date().toISOString(),
        },
      ],
      decayed_active_biases: ["bias:ancoragem"],
      meta: { stage: { picked: null } },
    },
  ]);
  console.log("[analytics] inserted heuristics_events", heuristicsRows[0]);

  return { responseId, userId };
}

async function seedPublicTables(
  client: GenericClient,
  interactionMeta: { responseId: string; userId: string }
): Promise<void> {
  const sessionId = `test_session_${Date.now()}`;
  const messageId = `msg_${Date.now()}`;
  const nowIso = new Date().toISOString();

  const interactionRows = await insertRows(client, "analytics.eco_interactions", [
    {
      user_id: interactionMeta.userId,
      session_id: sessionId,
      message_id: messageId,
      prompt_hash: "abc123",
      module_combo: ["IDENTIDADE", "VIVA"],
      tokens_in: 120,
      tokens_out: 340,
      latency_ms: 800,
      created_at: nowIso,
    },
  ]);

  const interactionId = (interactionRows[0]?.id as string | undefined) ?? null;
  if (!interactionId) {
    throw new Error("eco_interactions insert did not return an id");
  }
  console.log("[eco_interactions] inserted", interactionRows[0]);

  const feedbackRows = await insertRows(client, "analytics.eco_feedback", [
    {
      interaction_id: interactionId,
      user_id: interactionMeta.userId,
      session_id: sessionId,
      vote: "up",
      reason: ["test_run"],
      source: "persistence-script",
      meta: { response_id: interactionMeta.responseId },
      created_at: nowIso,
    },
  ]);
  console.log("[eco_feedback] inserted ok", feedbackRows[0]);

  const passiveRows = await insertRows(client, "analytics.eco_passive_signals", [
    {
      interaction_id: interactionId,
      signal: "read_complete",
      meta: { script: "persistence", value: 1 },
      created_at: nowIso,
    },
  ]);
  console.log("[eco_passive_signals] inserted", passiveRows[0]);

  const moduleUsageRows = await insertRows(client, "analytics.eco_module_usages", [
    {
      interaction_id: interactionId,
      module_key: "IDENTIDADE",
      tokens: 60,
      position: 1,
      created_at: nowIso,
    },
    {
      interaction_id: interactionId,
      module_key: "VIVA",
      tokens: 45,
      position: 2,
      created_at: nowIso,
    },
  ]);
  console.log("[eco_module_usages] inserted", moduleUsageRows.map((row) => row.id));

  const banditKey = `test_arm_${Date.now()}`;
  const banditRows = await upsertRows(client, "analytics.eco_bandit_arms", [
    {
      arm_key: banditKey,
      pulls: 1,
      alpha: 1.2,
      beta: 0.9,
      reward_sum: 0.72,
      reward_sq_sum: 0.52,
      last_update: nowIso,
    },
  ]);
  console.log("[eco_bandit_arms] upserted", banditRows[0]);

  const policyRows = await upsertRows(client, "analytics.eco_policy_config", [
    {
      key: `test_policy_${Date.now()}`,
      tokens_budget: 400,
      config: { version: 1, modules: ["IDENTIDADE", "VIVA"] },
      updated_at: nowIso,
    },
  ]);
  console.log("[eco_policy_config] upserted", policyRows[0]);
}

async function main(): Promise<void> {
  const url = assertEnv("SUPABASE_URL", process.env.SUPABASE_URL);
  const serviceKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const analyticsClient = supabase.schema("analytics") as unknown as GenericClient;

  const analyticsMeta = await seedAnalyticsTables(analyticsClient);
  await seedPublicTables(analyticsClient, analyticsMeta);

  console.log("✅ Persistence smoke test completed");
}

main().catch((error) => {
  console.error("❌ Persistence smoke test failed", error);
  process.exitCode = 1;
});
