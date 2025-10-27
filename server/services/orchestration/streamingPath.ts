import type { ActivationTracer } from "../../core/activationTracer";
import type { RetrieveMode } from "../supabase/memoriaRepository";
import type { EcoStreamingResult } from "../conversation/types";
import { executeStreamingLLM } from "../conversation/streamingOrchestrator";
import { persistAnalyticsSafe, withAnalyticsFinalize } from "../analytics/analyticsOrchestrator";
import type { GetEcoResult } from "../../utils";

export type StreamingPathParams = Parameters<typeof executeStreamingLLM>[0];

export async function runStreamingPath({
  llmParams,
  analytics,
}: {
  llmParams: StreamingPathParams;
  analytics: {
    retrieveMode: RetrieveMode;
    activationTracer?: ActivationTracer | null;
    userId?: string | null;
  };
}): Promise<EcoStreamingResult> {
  const streamingResult = await executeStreamingLLM(llmParams);
  const finalize = withAnalyticsFinalize(streamingResult.finalize as () => Promise<GetEcoResult>, analytics);

  return { ...streamingResult, finalize };
}

export function finalizePreLLM(
  finalize: () => Promise<GetEcoResult>,
  analytics: {
    retrieveMode: RetrieveMode;
    activationTracer?: ActivationTracer | null;
    userId?: string | null;
  }
) {
  let finalizePromise: Promise<GetEcoResult> | null = null;
  return async () => {
    if (!finalizePromise) {
      finalizePromise = (async () => {
        const result = await finalize();
        await persistAnalyticsSafe({ ...analytics, result });
        return result;
      })();
    }
    return finalizePromise;
  };
}
