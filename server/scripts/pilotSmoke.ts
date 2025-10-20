import { randomUUID } from "node:crypto";
import process from "node:process";

import { ensureModuleManifest } from "../services/promptContext/moduleManifest";

const INTERACTIONS = 5;
const SAMPLE_MESSAGES = [
  "Eco, preciso de uma resposta prática para lidar com ansiedade no trabalho enquanto sigo cuidadoso com minha equipe.",
  "Estou exausto com minha rotina, os planos sempre falham e quero construir disciplina sem me culpar.",
  "Tenho conversas difíceis com amigos e quero aprender a responder com mais presença e menos defensividade.",
];

type SelectorStages = {
  family?: { decisions?: any[] };
  knapsack?: { budget?: number; tokensAditivos?: number; adopted?: string[] };
  [key: string]: unknown;
};

type DebugTrace = {
  signals?: {
    selectorStages?: SelectorStages;
    [key: string]: unknown;
  };
};

type BanditRewardRecord = {
  family?: string | null;
  arm_id?: string | null;
  reward?: number | null;
  reward_key?: string | null;
  tokens?: number | null;
  chosen_by?: string | null;
};

const capturedSelectorLogs: Array<Record<string, unknown>> = [];

function ensureEnvDefaults(): () => void {
  const original = {
    SHADOW: process.env.ECO_BANDIT_SHADOW,
    EARLY: process.env.ECO_BANDIT_EARLY,
    PILOT: process.env.ECO_BANDIT_PILOT_PERCENT,
  };
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "pilot-smoke-stub";
  }
  process.env.ECO_BANDIT_SHADOW = "0";
  process.env.ECO_BANDIT_EARLY = "1";
  process.env.ECO_LOG_LEVEL = process.env.ECO_LOG_LEVEL ?? "info";
  return () => {
    if (original.SHADOW == null) delete process.env.ECO_BANDIT_SHADOW;
    else process.env.ECO_BANDIT_SHADOW = original.SHADOW;
    if (original.EARLY == null) delete process.env.ECO_BANDIT_EARLY;
    else process.env.ECO_BANDIT_EARLY = original.EARLY;
    if (original.PILOT == null) delete process.env.ECO_BANDIT_PILOT_PERCENT;
    else process.env.ECO_BANDIT_PILOT_PERCENT = original.PILOT;
  };
}

function installClaudeStub(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const claudeAdapter = require("../core/ClaudeAdapter") as typeof import("../core/ClaudeAdapter");
  claudeAdapter.claudeChatCompletion = async () => ({
    content: "[pilot-smoke] resposta simulada",
    model: "pilot-smoke",
    usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
    raw: {
      id: "pilot-smoke-stub",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "[pilot-smoke] resposta simulada" }],
      model: "pilot-smoke",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
    },
  });
  claudeAdapter.streamClaudeChatCompletion = async (_opts, callbacks) => {
    await callbacks.onControl?.({ type: "done", finishReason: "stop", usage: { total_tokens: 0 } });
  };
}

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

function extractDecisions(selectorStages: SelectorStages): any[] {
  if (!selectorStages?.family) return [];
  const decisions = selectorStages.family.decisions;
  return Array.isArray(decisions) ? decisions : [];
}

function buildRewardIndex(records: BanditRewardRecord[]): Map<string, BanditRewardRecord> {
  const index = new Map<string, BanditRewardRecord>();
  for (const record of records) {
    if (!record || typeof record.family !== "string" || typeof record.arm_id !== "string") continue;
    const key = `${record.family}::${record.arm_id}`;
    index.set(key, record);
  }
  return index;
}

async function main(): Promise<void> {
  const restoreEnv = ensureEnvDefaults();
  try {
    installClaudeStub();
    installSelectorLogInterceptor();
    await ensureModuleManifest();

    const { getEcoResponse } = await import("../services/ConversationOrchestrator");

    const guestRoot = randomUUID();
    let knapsackFailure = false;
    let interactionsWithTs = 0;
    let totalRewardSum = 0;
    let totalRewardCount = 0;
    const rewardTotals = new Map<string, { sum: number; count: number }>();

    for (let i = 0; i < INTERACTIONS; i += 1) {
      const pilotPercent = i === 0 ? "100" : "0";
      process.env.ECO_BANDIT_PILOT_PERCENT = pilotPercent;

      const message = SAMPLE_MESSAGES[i % SAMPLE_MESSAGES.length];
      const guestId = `${guestRoot}-${i + 1}`;

      const logStart = capturedSelectorLogs.length;
      const response = await getEcoResponse({
        messages: [
          {
            id: `${guestId}-msg`,
            role: "user",
            content: message,
          },
        ],
        userId: guestId,
        userName: null,
        mems: [],
        forcarMetodoViva: false,
        blocoTecnicoForcado: null,
        clientHour: undefined,
        sessionMeta: undefined,
        isGuest: true,
        guestId,
      } as any);

      const debugTrace: DebugTrace = ((response as any)?.meta?.debug_trace ?? {}) as DebugTrace;
      const selectorStages: SelectorStages = (debugTrace?.signals?.selectorStages ?? {}) as SelectorStages;
      const decisions = extractDecisions(selectorStages);

      const analytics = (response as any)?.meta?.analytics ?? {};
      const rewardRecordsRaw = Array.isArray(analytics?.bandit_rewards)
        ? (analytics.bandit_rewards as BanditRewardRecord[])
        : [];
      const rewardIndex = buildRewardIndex(rewardRecordsRaw);

      const newLogs = capturedSelectorLogs.slice(logStart);
      const knapsackLog = newLogs.find((entry) => entry.selector_stage === "knapsack") as
        | { aux_tokens_planned?: unknown; cap?: unknown; within_cap?: unknown }
        | undefined;
      const withinCap = (() => {
        if (!knapsackLog) return null;
        const cap = Number.isFinite(knapsackLog.cap) ? Number(knapsackLog.cap) : null;
        const planned = Number.isFinite(knapsackLog.aux_tokens_planned)
          ? Number(knapsackLog.aux_tokens_planned)
          : null;
        if (cap == null || planned == null) return null;
        return planned <= cap;
      })();
      if (withinCap === false) {
        knapsackFailure = true;
      }

      let sawTsThisInteraction = false;

      for (const decision of decisions) {
        const familyId = typeof decision?.familyId === "string" ? decision.familyId : "(unknown)";
        const chosen = typeof decision?.chosen === "string" ? decision.chosen : null;
        const chosenBy = decision?.chosenBy === "ts" ? "ts" : "baseline";
        if (chosenBy === "ts") {
          sawTsThisInteraction = true;
        }

        const eligible: Array<{ id: string; alpha: number | null; beta: number | null }> = Array.isArray(
          decision?.eligibleArms
        )
          ? decision.eligibleArms.map((arm: any) => ({
              id: typeof arm?.id === "string" ? arm.id : "",
              alpha: Number.isFinite(arm?.alpha) ? Number(arm.alpha) : null,
              beta: Number.isFinite(arm?.beta) ? Number(arm.beta) : null,
            }))
          : [];
        const stats = eligible.find((entry) => entry.id && entry.id === chosen) ?? null;

        const rewardRecord = chosen ? rewardIndex.get(`${familyId}::${chosen}`) ?? null : null;
        const rewardValue = rewardRecord?.reward != null && Number.isFinite(rewardRecord.reward)
          ? Number(rewardRecord.reward)
          : null;

        if (rewardValue != null) {
          totalRewardSum += rewardValue;
          totalRewardCount += 1;
          const aggregate = rewardTotals.get(familyId) ?? { sum: 0, count: 0 };
          aggregate.sum += rewardValue;
          aggregate.count += 1;
          rewardTotals.set(familyId, aggregate);
        }

        console.log(
          JSON.stringify(
            {
              interaction: i + 1,
              selector_stage: "pilot_pick",
              family: familyId,
              arm_id: chosen,
              chosen_by: chosenBy,
              reward_key: typeof decision?.rewardKey === "string" ? decision.rewardKey : rewardRecord?.reward_key ?? null,
              reward: rewardValue,
              tokens: Number.isFinite(decision?.tokensPlanned) ? Number(decision.tokensPlanned) : rewardRecord?.tokens ?? null,
              alpha: stats?.alpha ?? null,
              beta: stats?.beta ?? null,
            },
            null,
            2
          )
        );
      }

      if (sawTsThisInteraction) {
        interactionsWithTs += 1;
      }

      if (knapsackLog) {
        console.log(
          JSON.stringify(
            {
              interaction: i + 1,
              selector_stage: "knapsack",
              aux_tokens_planned: Number.isFinite(knapsackLog?.aux_tokens_planned)
                ? Number(knapsackLog.aux_tokens_planned)
                : null,
              cap: Number.isFinite(knapsackLog?.cap) ? Number(knapsackLog.cap) : null,
              within_cap: withinCap,
            },
            null,
            2
          )
        );
      }
    }

    const ratioTs = interactionsWithTs / INTERACTIONS;
    const overallAvg = totalRewardCount > 0 ? totalRewardSum / totalRewardCount : 0;

    const averages: Array<{ family: string; average: number | null; samples: number }> = [];
    for (const [family, stats] of rewardTotals.entries()) {
      const avg = stats.count > 0 ? stats.sum / stats.count : null;
      averages.push({ family, average: avg != null ? Number(avg.toFixed(4)) : null, samples: stats.count });
    }

    console.log(
      JSON.stringify(
        {
          selector_stage: "pilot_summary",
          interactions: INTERACTIONS,
          ts_interactions: interactionsWithTs,
          ts_ratio: Number(ratioTs.toFixed(3)),
          overall_avg_reward: totalRewardCount > 0 ? Number(overallAvg.toFixed(4)) : null,
          families: averages,
        },
        null,
        2
      )
    );

    if (knapsackFailure) {
      console.error("[pilotSmoke] Knapsack excedeu o limite de tokens planejados.");
      process.exitCode = 1;
      return;
    }

    if (interactionsWithTs === 0 || ratioTs < 0.1) {
      console.error("[pilotSmoke] Menos de 10% das interações passaram pelo bandit (ts).");
      process.exitCode = 1;
      return;
    }

    if (totalRewardCount === 0 || overallAvg <= 0.4) {
      console.error("[pilotSmoke] Recompensa média não atingiu 0.4.");
      process.exitCode = 1;
      return;
    }

    console.log("[pilotSmoke] Execução concluída com sucesso.");
  } catch (error) {
    console.error("[pilotSmoke] Falha inesperada:", error);
    process.exitCode = 1;
  } finally {
    restoreEnv();
  }
}

main();
