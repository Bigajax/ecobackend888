import type { ActivationTracer } from "../../core/activationTracer";
import type { RetrieveMode } from "../supabase/memoriaRepository";
import { executeFullLLM } from "../conversation/fullOrchestrator";
import { persistAnalyticsSafe } from "../analytics/analyticsOrchestrator";
import type { GetEcoResult } from "../../utils";

export type FullPathParams = Parameters<typeof executeFullLLM>[0];

export async function runFullPath({
  llmParams,
  analytics,
}: {
  llmParams: FullPathParams;
  analytics: {
    retrieveMode: RetrieveMode;
    activationTracer?: ActivationTracer | null;
    userId?: string | null;
  };
}): Promise<GetEcoResult> {
  const result = await executeFullLLM(llmParams);
  await persistAnalyticsSafe({ ...analytics, result });
  return result;
}
