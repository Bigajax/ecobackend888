import { randomUUID } from "node:crypto";
import process from "node:process";

import { ensureModuleManifest } from "../services/promptContext/moduleManifest";
import type { GetEcoParams } from "../utils";

const INTERACTIONS = 3;
const SAMPLE_MESSAGES = [
  "Oi Eco, estou me sentindo ansioso com o trabalho porque acumulei muitas tarefas, durmo mal há dias e fico ruminando sobre conversas difíceis que preciso ter com a minha equipe sem soar agressivo ou distante.",
  "Tenho dúvidas sobre como manter minha rotina saudável quando falho nos planos; começo a me culpar, pulo refeições, deixo de treinar e termino o dia exausto, então queria entender como quebrar esse ciclo e pedir ajuda sem parecer fraco.",
  "Quero entender porque fico tão na defensiva em conversas com amigos próximos, principalmente quando tocam em temas familiares; sinto um aperto no peito, falo mais alto que o normal e depois me arrependo do tom duro, então busco estratégias para responder com mais presença.",
];

type LLMUsage = {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
};

type LLMResult = {
  content: string;
  model: string;
  usage: LLMUsage;
  raw?: unknown;
};

type EligibleArm = {
  id: string;
  size?: string;
  tokens_avg?: number;
};

type RawEligibleArm = Partial<EligibleArm> & {
  tokensAvg?: number;
  gatePassed?: boolean;
  gate_passed?: boolean;
  alpha?: number;
  beta?: number;
  count?: number;
};

type FamilyEligibleEntry = {
  id: string;
  gate_passed: boolean;
  tokens_avg: number;
  alpha: number | null;
  beta: number | null;
  count: number | null;
};

type SelectorStages = {
  family?: { decisions?: any[] };
  knapsack?: { budget?: number; tokensAditivos?: number; adopted?: string[] };
  stitch?: { final?: string[] };
  [key: string]: unknown;
};

type DebugTrace = {
  signals?: {
    selectorStages?: SelectorStages;
    [key: string]: unknown;
  };
};

type ShadowOrchestrator = typeof import("../services/ConversationOrchestrator")["getEcoResponse"];
type ShadowRunResult = Awaited<ReturnType<ShadowOrchestrator>>;

function ensureEnvDefaults(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "shadow-smoke-stub";
  }
  process.env.ECO_BANDIT_SHADOW = process.env.ECO_BANDIT_SHADOW ?? "1";
  process.env.ECO_BANDIT_EARLY = "0";
  process.env.ECO_LOG_LEVEL = process.env.ECO_LOG_LEVEL ?? "info";
}

function installClaudeStub(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const claudeAdapter = require("../core/ClaudeAdapter") as typeof import("../core/ClaudeAdapter");
  claudeAdapter.claudeChatCompletion = (async () => {
    const stub: LLMResult = {
      content: "[shadow-smoke] resposta simulada",
      model: "shadow-smoke",
      usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
    };
    return stub;
  }) as unknown as typeof claudeAdapter.claudeChatCompletion;
  claudeAdapter.streamClaudeChatCompletion = async (_opts, callbacks) => {
    await callbacks.onControl?.({ type: "done", finishReason: "stop", usage: { total_tokens: 0 } });
  };
}

const capturedSelectorLogs: Array<Record<string, unknown>> = [];

function installSelectorLogInterceptor(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loggerModule = require("../services/promptContext/logger") as typeof import("../services/promptContext/logger");
  const baseLog = loggerModule.log;
  const originalInfo = baseLog.info.bind(baseLog);
  baseLog.info = ((...args: unknown[]) => {
    if (args.length > 0 && typeof args[0] === "object" && args[0] && (args[0] as any).selector_stage) {
      capturedSelectorLogs.push(args[0] as Record<string, unknown>);
    }
    return originalInfo(...args);
  }) as typeof baseLog.info;
}

async function runOneShadow(
  orchestrator: ShadowOrchestrator,
  {
    message,
    guestId,
  }: {
    message: string;
    guestId: string;
  }
): Promise<ShadowRunResult> {
  const payload: GetEcoParams = {
    messages: [
      {
        id: `${guestId}-msg`,
        role: "user",
        content: message,
      },
    ],
    userId: guestId,
    userName: undefined,
    mems: [],
    forcarMetodoViva: false,
    blocoTecnicoForcado: null,
    clientHour: undefined,
    sessionMeta: undefined,
    isGuest: true,
    guestId,
    accessToken: undefined,
    activationTracer: undefined,
  };

  return (await orchestrator(payload as any)) as unknown as ShadowRunResult;
}

interface FamilyAggregateEntry {
  id: string;
  eligible: FamilyEligibleEntry[];
  tsPick: string | null;
  chosen: string | null;
  chosenBy: string | null;
  rewardKey: string | null;
  tokensPlanned: number | null;
  alpha: number | null;
  beta: number | null;
}

type TSPickLog = {
  selector_stage: "ts_pick";
  family: string;
  ts_pick: string | null;
  chosen: string | null;
  chosen_by: string;
  reward_key: string | null;
  alpha: number | null;
  beta: number | null;
  tokens_planned: number | null;
  eligible_arms: EligibleArm[];
};

function buildFamilyAggregates(decisions: any[]): {
  aggregate: Record<string, FamilyAggregateEntry>;
  failingFamilies: string[];
  tsLogs: TSPickLog[];
} {
  const aggregate: Record<string, FamilyAggregateEntry> = {};
  const failingFamilies: string[] = [];
  const tsLogs: TSPickLog[] = [];

  for (const decision of decisions) {
    const familyId = typeof decision?.familyId === "string" ? decision.familyId : "(unknown)";
    const eligibleArmsRaw: RawEligibleArm[] = Array.isArray(decision?.eligibleArms)
      ? (decision.eligibleArms as RawEligibleArm[])
      : [];
    const normalizedEligible = eligibleArmsRaw.map((arm: RawEligibleArm): FamilyEligibleEntry => {
      const id = typeof arm?.id === "string" ? arm.id : "";
      const tokensCandidate = arm?.tokens_avg ?? arm?.tokensAvg;
      const tokensAvg = Number.isFinite(tokensCandidate) ? Number(tokensCandidate) : 0;
      return {
        id,
        gate_passed: Boolean(arm?.gatePassed ?? arm?.gate_passed),
        tokens_avg: tokensAvg,
        alpha: Number.isFinite(arm?.alpha) ? Number(arm.alpha) : null,
        beta: Number.isFinite(arm?.beta) ? Number(arm.beta) : null,
        count: Number.isFinite(arm?.count) ? Number(arm.count) : null,
      };
    });

    const tsPick = typeof decision?.tsPick === "string" ? decision.tsPick : null;
    const chosen = typeof decision?.chosen === "string" ? decision.chosen : null;
    const chosenBy = typeof decision?.chosenBy === "string" ? decision.chosenBy : null;
    const rewardKey = typeof decision?.rewardKey === "string" ? decision.rewardKey : null;
    const tokensPlanned = Number.isFinite(decision?.tokensPlanned) ? Number(decision.tokensPlanned) : null;

    const statsSource =
      normalizedEligible.find((arm: FamilyEligibleEntry) => arm.id && (arm.id === tsPick || arm.id === chosen)) ??
      null;

    aggregate[familyId] = {
      id: familyId,
      eligible: normalizedEligible,
      tsPick,
      chosen,
      chosenBy,
      rewardKey,
      tokensPlanned,
      alpha: statsSource?.alpha ?? null,
      beta: statsSource?.beta ?? null,
    };

    if (!normalizedEligible.some((arm: FamilyEligibleEntry) => arm.gate_passed)) {
      failingFamilies.push(familyId);
    }

    const eligibleSnapshot = eligibleArmsRaw.map((arm: RawEligibleArm) => {
      const snapshot: EligibleArm = {
        id: typeof arm?.id === "string" ? arm.id : "",
      };
      if (typeof arm?.size === "string") {
        snapshot.size = arm.size;
      }
      const tokensCandidate = arm?.tokens_avg ?? arm?.tokensAvg;
      if (Number.isFinite(tokensCandidate)) {
        snapshot.tokens_avg = Number(tokensCandidate);
      }
      return snapshot;
    });

    tsLogs.push({
      selector_stage: "ts_pick",
      family: familyId,
      ts_pick: tsPick,
      chosen,
      chosen_by: chosenBy ?? "shadow",
      reward_key: rewardKey,
      alpha: statsSource?.alpha ?? null,
      beta: statsSource?.beta ?? null,
      tokens_planned: tokensPlanned,
      eligible_arms: eligibleSnapshot,
    });
  }

  return { aggregate, failingFamilies, tsLogs };
}

function logTSPick(interaction: number, entry: TSPickLog): void {
  const payload = {
    ...entry,
    eligible_arms: entry.eligible_arms.map((arm: EligibleArm) => ({
      id: arm?.id ?? "",
      size: arm?.size,
      tokens_avg: arm?.tokens_avg,
    })),
  };
  console.log(JSON.stringify({ interaction, ...payload }, null, 2));
}

async function main(): Promise<void> {
  ensureEnvDefaults();
  installClaudeStub();
  installSelectorLogInterceptor();
  await ensureModuleManifest();

  const { getEcoResponse } = await import("../services/ConversationOrchestrator");

  const guestRoot = randomUUID();
  const failures = new Set<string>();
  let budgetFailure = false;

  for (let i = 0; i < INTERACTIONS; i += 1) {
    const message = SAMPLE_MESSAGES[i % SAMPLE_MESSAGES.length];
    const guestId = `${guestRoot}-${i + 1}`;

    const logStart = capturedSelectorLogs.length;

    const response = await runOneShadow(getEcoResponse, { message, guestId });

    const debugTrace: DebugTrace = ((response as any)?.meta?.debug_trace ?? {}) as DebugTrace;
    const selectorStages: SelectorStages = (debugTrace?.signals?.selectorStages ?? {}) as SelectorStages;
    const decisions = Array.isArray(selectorStages.family?.decisions)
      ? selectorStages.family!.decisions!
      : [];

    const newSelectorLogs = capturedSelectorLogs.slice(logStart);

    const { aggregate, failingFamilies, tsLogs } = buildFamilyAggregates(decisions);
    failingFamilies.forEach((family) => failures.add(family));

    console.log(
      JSON.stringify({ selector_stage: "family_group", interaction: i + 1, families: aggregate }, null, 2)
    );
    for (const logEntry of tsLogs) {
      logTSPick(i + 1, logEntry);
    }

    const knapsack = selectorStages.knapsack ?? null;
    if (knapsack) {
      const budget = Number.isFinite(knapsack.budget) ? Number(knapsack.budget) : null;
      const aux = Number.isFinite(knapsack.tokensAditivos) ? Number(knapsack.tokensAditivos) : null;
      const withinCap = budget != null && aux != null ? aux <= budget : null;
      if (withinCap === false) {
        budgetFailure = true;
      }
      console.log(
        JSON.stringify(
          {
            selector_stage: "knapsack",
            interaction: i + 1,
            aux_tokens_planned: aux,
            cap: budget,
            within_cap: withinCap,
            adopted: Array.isArray(knapsack.adopted) ? knapsack.adopted : [],
          },
          null,
          2
        )
      );
    }

    const stitchFinal = Array.isArray(selectorStages.stitch?.final)
      ? selectorStages.stitch!.final!
      : Array.isArray((debugTrace?.signals as any)?.selectedModules)
      ? ((debugTrace?.signals as any)?.selectedModules as string[])
      : [];
    console.log(
      JSON.stringify({ selector_stage: "stitch", interaction: i + 1, final_modules: stitchFinal }, null, 2)
    );

    const contextSource = (() => {
      const rpcLog = newSelectorLogs.reverse().find((entry) => entry.selector_stage === "rpc") as
        | { context_source?: unknown }
        | undefined;
      if (rpcLog && typeof rpcLog.context_source === "string") {
        return rpcLog.context_source;
      }
      const manual =
        (selectorStages as any)?.rpc?.context_source ??
        (debugTrace?.signals as any)?.context_source ??
        (debugTrace?.signals as any)?.sources?.mems;
      return typeof manual === "string" ? manual : null;
    })();
    if (contextSource) {
      console.log(
        JSON.stringify({ selector_stage: "rpc", interaction: i + 1, context_source: contextSource }, null, 2)
      );
    }
  }

  if (failures.size > 0 || budgetFailure) {
    if (failures.size > 0) {
      console.error(
        `Famílias sem arms elegíveis durante o shadow smoke: ${Array.from(failures).join(", ")}`
      );
    }
    if (budgetFailure) {
      console.error("Knapsack excedeu o limite de tokens planejados.");
    }
    process.exitCode = 1;
    return;
  }

  console.log("[shadowSmoke] Todas as interações ficaram dentro do limite e com arms elegíveis.");
}

main().catch((error) => {
  console.error("[shadowSmoke] Falha inesperada:", error);
  process.exitCode = 1;
});
