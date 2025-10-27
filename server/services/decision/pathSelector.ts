import type { ChatMessage } from "../../utils";
import type { EcoHints } from "../../utils/types";
import { defaultConversationRouter } from "../conversation/router";
import type { EcoStreamHandler } from "../conversation/types";
import type { EcoDecisionResult } from "../conversation/ecoDecisionHub";
import type { RetrieveMode } from "../supabase/memoriaRepository";

export type RetrieveDecision = {
  mode: RetrieveMode;
  reason: string;
  wordCount: number;
  charLength: number;
};

export type RouteDecision = ReturnType<typeof defaultConversationRouter.decide>;

export function inferRetrieveMode({
  ultimaMsg,
  hints,
  ecoDecision,
}: {
  ultimaMsg: string;
  hints?: EcoHints | null;
  ecoDecision: EcoDecisionResult;
}): RetrieveDecision {
  const text = (ultimaMsg ?? "").trim();
  const charLength = text.length;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const paragraphCount = text
    ? text
        .split(/\n{2,}/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0).length
    : 0;

  const hasDeepFlag = Array.isArray(hints?.flags)
    ? hints!.flags!.some((flag) => /journal|reflex|longform|profundo/i.test(flag))
    : false;

  if (hasDeepFlag) {
    return { mode: "DEEP", reason: "hint_flag", wordCount, charLength };
  }

  if (wordCount >= 150 || charLength >= 700) {
    return { mode: "DEEP", reason: "long_text", wordCount, charLength };
  }

  if (paragraphCount >= 3 && wordCount >= 80) {
    return { mode: "DEEP", reason: "multi_paragraph", wordCount, charLength };
  }

  if (ecoDecision.intensity >= 7 && ecoDecision.openness >= 2 && wordCount >= 60) {
    return { mode: "DEEP", reason: "high_intensity", wordCount, charLength };
  }

  if (wordCount >= 100) {
    return { mode: "DEEP", reason: "long_words", wordCount, charLength };
  }

  if (wordCount <= 40 && charLength <= 260) {
    return { mode: "FAST", reason: "short_text", wordCount, charLength };
  }

  return { mode: "FAST", reason: "default", wordCount, charLength };
}

export function decideRoute(options: {
  messages: ChatMessage[];
  ultimaMsg: string;
  forcarMetodoViva: boolean;
  promptOverride?: string;
  decision: EcoDecisionResult;
}): RouteDecision {
  return defaultConversationRouter.decide(options);
}

export function shouldUseFastLane({
  routeDecision,
  streamHandler,
}: {
  routeDecision: RouteDecision;
  streamHandler?: EcoStreamHandler | null;
}): boolean {
  return routeDecision.mode === "fast" && !streamHandler;
}
