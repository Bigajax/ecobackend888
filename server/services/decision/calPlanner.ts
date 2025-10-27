import { planHints as corePlanHints } from "../../core/ResponsePlanner";
import { materializeHints as coreMaterializeHints } from "../../core/ResponseGenerator";
import { log } from "../promptContext/logger";
import { mapRoleForOpenAI, type ChatMessage } from "../../utils";
import type { EcoHints } from "../../utils/types";
import type { Msg } from "../../core/ClaudeAdapter";

export type PlannedHints = ReturnType<typeof corePlanHints>;

export function planCalHints(
  ultimaMsg: string,
  options: Parameters<typeof corePlanHints>[1]
): PlannedHints {
  return corePlanHints(ultimaMsg, options);
}

export function materializeCalHints(plan: PlannedHints, ultimaMsg: string): EcoHints | null {
  return coreMaterializeHints(plan, ultimaMsg);
}

export function computeCalHints({ thread, ultimaMsg }: { thread: ChatMessage[]; ultimaMsg: string }) {
  const recentUserInputs = thread
    .slice(0, -1)
    .filter((msg) => mapRoleForOpenAI(msg.role) === "user")
    .slice(-3)
    .map((msg) => msg.content ?? "");

  let lastHintKey: string | null = null;
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const candidate = thread[i];
    if (!candidate || typeof candidate.content !== "string") continue;
    if (!candidate.content.includes("ECO_HINTS")) continue;
    const match = candidate.content.match(/ECO_HINTS\(JSON\):\s*(\{.+?\})\s*\|/);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1]!);
      if (parsed && typeof parsed.key === "string") {
        lastHintKey = parsed.key;
        break;
      }
    } catch {
      // ignora parsing falho
    }
  }

  const plannedHints = planCalHints(ultimaMsg, { recentUserInputs, lastHintKey });
  const calHints = materializeCalHints(plannedHints, ultimaMsg);

  return { plannedHints, calHints };
}

export function injectCalHints({ prompt, calHints }: { prompt: Msg[]; calHints: EcoHints | null }) {
  if (!calHints || calHints.score < 0.6) {
    return { prompt, injected: false };
  }

  const hintPayload = `ECO_HINTS(JSON): ${JSON.stringify(calHints)} | Use como orientação. Não repita literalmente. Preserve continuidade.`;
  const hintMessage: Msg = {
    role: "system",
    name: "eco_hints",
    content: hintPayload,
  };
  const updatedPrompt: Msg[] = [hintMessage, ...prompt];

  if (process.env.ECO_DEBUG === "1") {
    log.debug?.(
      `[CAL] key=${calHints.key} score=${calHints.score.toFixed(2)} flags=[${calHints.flags.join(",")}] injected`
    );
  }

  return { prompt: updatedPrompt, injected: true };
}
