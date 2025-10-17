import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import Module from "module";
import { EventEmitter } from "events";

import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { persistAnalyticsRecords } from "../server/services/ConversationOrchestrator";
import {
  createInteraction,
  insertModuleUsages,
  updateInteraction,
} from "../server/services/conversation/interactionAnalytics";
import { registrarFeedback } from "../server/controllers/feedbackController";
import type { Request, Response } from "express";

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable ${key}`);
  }
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { "X-Client": "eco-smoke-feedback" } },
});

const analytics = supabase.schema("analytics");

type TableCountMap = Record<string, number>;

type BanditArmState = {
  pulls: number;
  alpha: number;
  beta: number;
  reward_sum: number;
  reward_sq_sum: number;
};

const trackedTables = [
  "eco_interactions",
  "eco_module_usages",
  "module_outcomes",
  "latency_samples",
  "resposta_q",
  "knapsack_decision",
  "eco_feedback",
  "bandit_rewards",
  "eco_bandit_arms",
] as const;

type TrackedTable = (typeof trackedTables)[number];

async function countRows(table: TrackedTable): Promise<number> {
  const { count, error } = await analytics.from(table).select("*", { count: "exact", head: true });
  if (error) {
    throw new Error(`Failed to count ${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function fetchBanditArm(armKey: string): Promise<BanditArmState | null> {
  const { data, error } = await analytics
    .from("eco_bandit_arms")
    .select("pulls,alpha,beta,reward_sum,reward_sq_sum")
    .eq("arm_key", armKey)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to fetch bandit arm ${armKey}: ${error.message}`);
  }
  if (!data) return null;
  return {
    pulls: Number((data as any).pulls ?? 0),
    alpha: Number((data as any).alpha ?? 0),
    beta: Number((data as any).beta ?? 0),
    reward_sum: Number((data as any).reward_sum ?? 0),
    reward_sq_sum: Number((data as any).reward_sq_sum ?? 0),
  };
}

type StubMap = Record<string, unknown>;

async function withPatchedModules<T>(stubs: StubMap, loader: () => Promise<T> | T): Promise<T> {
  const originalLoad = Module._load;
  Module._load = function patched(request: string, parent: any, isMain: boolean) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return originalLoad(request, parent, isMain);
  } as typeof Module._load;

  try {
    return await loader();
  } finally {
    Module._load = originalLoad;
  }
}

async function loadRouterWithStubs(modulePath: string, stubs: StubMap) {
  return withPatchedModules(stubs, () => {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
    const mod = require(modulePath);
    return mod.default ?? mod;
  });
}

function getRouteHandler(router: any, path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path);
  if (!layer) throw new Error(`Route ${path} not found`);
  const handler = layer.route.stack[0]?.handle;
  if (!handler) throw new Error(`Handler for ${path} not found`);
  return handler;
}

class MockRequest extends EventEmitter {
  body: any;
  headers: Record<string, string>;
  method = "POST";
  query: Record<string, unknown> = {};
  ip = "127.0.0.1";
  path: string;
  originalUrl: string;
  guest: { id?: string } = {};
  guestId?: string;
  user?: { id?: string };

  constructor(path: string, body: any, headers: Record<string, string>) {
    super();
    this.path = path;
    this.originalUrl = path;
    this.body = body;
    this.headers = headers;
  }

  get(name: string) {
    return this.headers[name.toLowerCase()];
  }
}

class MockResponse {
  statusCode = 200;
  payload: unknown = null;
  headers = new Map<string, string>();

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown) {
    this.payload = payload;
    return this;
  }

  end() {
    return this;
  }
}

type ProducedResponse = {
  responseId: string;
  interactionId: string;
};

const producedResponses: ProducedResponse[] = [];

async function stubbedGetEcoResponse(params: Record<string, any>) {
  const userId = typeof params.userId === "string" ? params.userId : null;
  const sessionId = typeof params.sessionMeta?.session_id === "string" ? params.sessionMeta.session_id : null;
  const interactionId =
    (await createInteraction({
      userId,
      sessionId,
      messageId: randomUUID(),
      promptHash: "smoke_test",
    })) ?? randomUUID();

  await updateInteraction(interactionId, {
    tokensIn: 128,
    tokensOut: 256,
    latencyMs: 620,
    moduleCombo: ["CORE::v1", "KNOWLEDGE::v1"],
  });

  await insertModuleUsages(interactionId, [
    { moduleKey: "CORE::v1", tokens: 120, position: 1 },
    { moduleKey: "KNOWLEDGE::v1", tokens: 80, position: 2 },
  ]);

  const responseId = randomUUID();
  const now = Date.now();

  const result = {
    raw: "Resposta de teste",
    meta: {
      analytics: {
        response_id: responseId,
        q: 0.82,
        estruturado_ok: true,
        memoria_ok: true,
        bloco_ok: true,
        tokens_total: 400,
        tokens_aditivos: 120,
        latency: { ttfb_ms: 140, ttlc_ms: 620 },
        module_outcomes: [
          { module_id: "CORE::v1", tokens: 120, q: 0.82, vpt: 0.0068 },
          { module_id: "KNOWLEDGE::v1", tokens: 80, q: 0.78, vpt: 0.00975 },
        ],
        knapsack: {
          budget: 420,
          ganho_estimado: 0.74,
          tokens_aditivos: 120,
          adotados: ["CORE::v1", "KNOWLEDGE::v1"],
        },
      },
      debug_trace: { timings: { llmStart: now, llmEnd: now + 620 } },
    },
  } as any;

  await persistAnalyticsRecords({
    result,
    retrieveMode: "FAST" as any,
    activationTracer: null,
    userId,
  });

  producedResponses.push({ responseId, interactionId });

  return result;
}

async function performAskEco(
  handler: (req: Request, res: Response) => Promise<void> | void,
  payload: Record<string, any>
): Promise<ProducedResponse> {
  const req = new MockRequest("/api/ask-eco", payload, {
    accept: "application/json",
  });
  req.query = { stream: "false" };
  const res = new MockResponse();
  await handler(req as unknown as Request, res as unknown as Response);
  if (res.statusCode !== 200) {
    throw new Error(`ask-eco handler returned status ${res.statusCode}`);
  }
  const produced = producedResponses.pop();
  if (!produced) {
    throw new Error("Expected stubbed getEcoResponse to record a response");
  }
  return produced;
}

class MockFeedbackResponse {
  statusCode = 204;
  ended = false;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown) {
    this.statusCode = this.statusCode === 204 ? 200 : this.statusCode;
    throw new Error(`Unexpected JSON payload: ${JSON.stringify(payload)}`);
  }

  end() {
    this.ended = true;
    return this;
  }
}

async function sendFeedback(body: Record<string, any>) {
  const req = {
    body,
    headers: {},
    get: (name: string) => undefined,
  } as unknown as Request;
  const res = new MockFeedbackResponse();
  await registrarFeedback(req, res as unknown as Response);
  if (res.statusCode !== 204) {
    throw new Error(`feedback handler returned status ${res.statusCode}`);
  }
}

async function logSqlView<T>(label: string, query: () => Promise<PostgrestSingleResponse<T>>) {
  const result = await query();
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  console.log(label);
  console.table(result.data as any[]);
}

async function main() {
  const initialCounts: TableCountMap = {};
  for (const table of trackedTables) {
    initialCounts[table] = await countRows(table);
  }

  const orchestratorStub = { getEcoResponse: stubbedGetEcoResponse };
  const router = await loadRouterWithStubs("../server/routes/promptRoutes", {
    "../services/ConversationOrchestrator": orchestratorStub,
  });
  const askHandler = getRouteHandler(router, "/");

  const askPayload = {
    messages: [{ role: "user", content: "Teste de circuito fechado." }],
    userId: "user_smoke",
    sessionMeta: { session_id: "S1" },
    stream: false,
  };

  const firstResponse = await performAskEco(askHandler, askPayload);
  const secondResponse = await performAskEco(askHandler, {
    ...askPayload,
    sessionMeta: { session_id: "S2" },
    messages: [{ role: "user", content: "Preciso de ajuda." }],
  });

  const afterAskCounts: TableCountMap = {};
  for (const table of trackedTables) {
    afterAskCounts[table] = await countRows(table);
  }

  const expectIncrease = (table: TrackedTable, minDelta: number) => {
    const delta = afterAskCounts[table] - initialCounts[table];
    if (delta < minDelta) {
      throw new Error(`Expected ${table} to increase by at least ${minDelta}, got ${delta}`);
    }
    console.log(`✅ ${table} +${delta}`);
  };

  expectIncrease("eco_interactions", 2);
  expectIncrease("resposta_q", 2);
  expectIncrease("latency_samples", 2);
  expectIncrease("knapsack_decision", 2);
  expectIncrease("module_outcomes", 2);
  expectIncrease("eco_module_usages", 2);

  const banditArmKeyUp = "CORE::v1";
  const banditArmKeyDown = "KNOWLEDGE::v1";
  const armStateBeforeUp = await fetchBanditArm(banditArmKeyUp);

  await sendFeedback({
    interaction_id: firstResponse.responseId,
    response_id: firstResponse.responseId,
    vote: "up",
    reason: "teste",
    source: "chat",
    arm: banditArmKeyUp,
  });

  const armStateAfterUp = await fetchBanditArm(banditArmKeyUp);

  const armStateBeforeDown = await fetchBanditArm(banditArmKeyDown);

  await sendFeedback({
    interaction_id: secondResponse.responseId,
    response_id: secondResponse.responseId,
    vote: "down",
    reason: "teste",
    source: "chat",
    arm: banditArmKeyDown,
  });

  const armStateAfterDown = await fetchBanditArm(banditArmKeyDown);

  const afterFeedbackCounts: TableCountMap = {};
  for (const table of trackedTables) {
    afterFeedbackCounts[table] = await countRows(table);
  }

  const checkDelta = (table: TrackedTable, previous: TableCountMap, expectedDelta: number) => {
    const delta = afterFeedbackCounts[table] - previous[table];
    if (delta !== expectedDelta) {
      throw new Error(`Expected ${table} delta ${expectedDelta} but got ${delta}`);
    }
    console.log(`✅ ${table} delta ${delta}`);
  };

  checkDelta("eco_feedback", afterAskCounts, 2);
  checkDelta("bandit_rewards", afterAskCounts, 2);

  if (!armStateAfterUp) {
    throw new Error("Bandit arm record missing after like feedback");
  }
  const pullsBeforeUp = armStateBeforeUp?.pulls ?? 0;
  const alphaBeforeUp = armStateBeforeUp?.alpha ?? 0;
  const rewardBeforeUp = armStateBeforeUp?.reward_sum ?? 0;

  if (armStateAfterUp.pulls !== pullsBeforeUp + 1) {
    throw new Error("Bandit arm pulls did not increment after like");
  }
  if (armStateAfterUp.alpha <= alphaBeforeUp) {
    throw new Error("Bandit arm alpha did not increase after like");
  }
  if (armStateAfterUp.reward_sum <= rewardBeforeUp) {
    throw new Error("Bandit reward sum did not increase after like");
  }
  console.log("✅ eco_bandit_arms alpha incremented for like");

  if (!armStateAfterDown) {
    throw new Error("Bandit arm record missing after dislike feedback");
  }
  const pullsBeforeDown = armStateBeforeDown?.pulls ?? 0;
  const betaBeforeDown = armStateBeforeDown?.beta ?? 0;
  const rewardBeforeDown = armStateBeforeDown?.reward_sum ?? 0;

  if (armStateAfterDown.pulls !== pullsBeforeDown + 1) {
    throw new Error("Bandit arm pulls did not increment after dislike");
  }
  if (armStateAfterDown.beta <= betaBeforeDown) {
    throw new Error("Bandit arm beta did not increase after dislike");
  }
  if (armStateAfterDown.reward_sum > rewardBeforeDown) {
    throw new Error("Bandit reward sum increased after dislike");
  }
  console.log("✅ eco_bandit_arms beta incremented for dislike");

  const beforeRepeatFeedback = armStateAfterUp;
  await sendFeedback({
    interaction_id: firstResponse.responseId,
    response_id: firstResponse.responseId,
    vote: "up",
    reason: "duplicado",
    source: "chat",
    arm: banditArmKeyUp,
  });
  const afterRepeatFeedback = await fetchBanditArm(banditArmKeyUp);
  const repeatCounts: TableCountMap = {};
  for (const table of trackedTables) {
    repeatCounts[table] = await countRows(table);
  }

  if (!beforeRepeatFeedback || !afterRepeatFeedback) {
    throw new Error("Failed to fetch bandit arm state for idempotence check");
  }

  if (
    beforeRepeatFeedback.alpha !== afterRepeatFeedback.alpha ||
    beforeRepeatFeedback.pulls !== afterRepeatFeedback.pulls ||
    beforeRepeatFeedback.reward_sum !== afterRepeatFeedback.reward_sum
  ) {
    throw new Error("Bandit arm metrics changed after duplicate feedback");
  }

  if (repeatCounts.eco_feedback !== afterFeedbackCounts.eco_feedback) {
    throw new Error("eco_feedback count changed after duplicate feedback");
  }

  if (repeatCounts.bandit_rewards !== afterFeedbackCounts.bandit_rewards) {
    throw new Error("bandit_rewards count changed after duplicate feedback");
  }

  console.log("✅ Duplicate feedback is idempotent");

  await logSqlView("SQL 1 - últimas interações", () =>
    analytics
      .from("eco_interactions")
      .select("id,user_id,module_combo,tokens_in,tokens_out,created_at")
      .order("created_at", { ascending: false })
      .limit(5)
  );

  await logSqlView("SQL 2 - última resposta_q", () =>
    analytics
      .from("resposta_q")
      .select("response_id,q,estruturado_ok,memoria_ok,bloco_ok,ttfb_ms,ttlc_ms,created_at")
      .order("created_at", { ascending: false })
      .limit(5)
  );

  await logSqlView("SQL 3 - módulos e outcomes", async () => {
    const latestInteraction = await analytics
      .from("eco_interactions")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestId = (latestInteraction.data as any)?.id ?? null;
    const moduleQuery = analytics
      .from("eco_module_usages")
      .select("interaction_id,module_key,tokens")
      .order("created_at", { ascending: false })
      .limit(10);
    if (latestId) {
      moduleQuery.eq("interaction_id", latestId);
    }
    const modules = await moduleQuery;
    if (modules.error) {
      return { data: null, error: modules.error } as PostgrestSingleResponse<any>;
    }
    const outcomes = await analytics
      .from("module_outcomes")
      .select("response_id,q,vpt")
      .eq("response_id", latestId ?? "")
      .limit(10);
    if (outcomes.error) {
      return { data: null, error: outcomes.error } as PostgrestSingleResponse<any>;
    }
    const joined = (modules.data ?? []).map((row) => ({
      interaction_id: (row as any).interaction_id,
      module_key: (row as any).module_key,
      tokens: (row as any).tokens,
      q: (outcomes.data ?? [])[0]?.q ?? null,
      vpt: (outcomes.data ?? [])[0]?.vpt ?? null,
    }));
    return { data: joined, error: null } as PostgrestSingleResponse<any>;
  });

  await logSqlView("SQL 4 - feedback e recompensas", () =>
    analytics
      .from("eco_feedback")
      .select("interaction_id,vote,created_at")
      .order("created_at", { ascending: false })
      .limit(10)
  );

  await logSqlView("SQL 5 - estado do bandit", () =>
    analytics
      .from("eco_bandit_arms")
      .select("arm_key,pulls,alpha,beta,reward_sum,reward_sq_sum,last_update")
      .order("last_update", { ascending: false })
      .limit(10)
  );

  console.log("✅ Smoke feedback script completed successfully");
}

main().catch((error) => {
  console.error("❌ Smoke feedback script failed", error);
  process.exit(1);
});
