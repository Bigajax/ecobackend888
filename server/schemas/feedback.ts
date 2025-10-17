import { z } from "zod";

export const FeedbackVoteSchema = z.enum(["up", "down"]);
export type FeedbackVote = z.infer<typeof FeedbackVoteSchema>;

const optionalUuid = () => z.string().uuid();
const optionalText = () => z.string().min(1);

export const FeedbackPayloadSchema = z.object({
  interaction_id: optionalUuid().nullable().optional(),
  response_id: optionalUuid().nullable().optional(),
  vote: FeedbackVoteSchema,
  reason: z.string().min(1).max(280).nullable().optional(),
  pillar: z.string().min(1).max(64).nullable().optional(),
  arm: z.string().min(1).max(128).nullable().optional(),
  session_id: optionalText().nullable().optional(),
  user_id: optionalUuid().nullable().optional(),
  source: optionalText().optional(),
  meta: z.record(z.unknown()).optional(),
});

export type FeedbackPayload = z.infer<typeof FeedbackPayloadSchema>;

export const InteractionPayloadSchema = z.object({
  interaction_id: z.string().uuid(),
  session_id: optionalText().nullable().optional(),
  user_id: optionalUuid().nullable().optional(),
  message_id: optionalText().optional(),
  prompt_hash: optionalText().optional(),
  module_combo: z.array(z.string().min(1)).optional(),
  tokens_in: z.number().int().nonnegative().optional(),
  tokens_out: z.number().int().nonnegative().optional(),
  latency_ms: z.number().int().nonnegative().optional(),
  meta: z.record(z.unknown()).optional(),
});

export type InteractionPayload = z.infer<typeof InteractionPayloadSchema>;

export const LatencyPayloadSchema = z.object({
  response_id: z.string().uuid(),
  ttfb_ms: z.number().int().nonnegative().nullable().optional(),
  ttlc_ms: z.number().int().nonnegative().nullable().optional(),
  tokens_total: z.number().int().nonnegative().nullable().optional(),
});

export type LatencyPayload = z.infer<typeof LatencyPayloadSchema>;
