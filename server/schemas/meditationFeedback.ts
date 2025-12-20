import { z } from "zod";

// Enum for vote options
export const MeditationVoteSchema = z.enum(["positive", "negative"]);
export type MeditationVote = z.infer<typeof MeditationVoteSchema>;

// Enum for negative feedback reasons
export const MeditationFeedbackReasonSchema = z.enum([
  "too_long",
  "hard_to_focus",
  "voice_music",
  "other"
]);
export type MeditationFeedbackReason = z.infer<typeof MeditationFeedbackReasonSchema>;

// Helper validators
const optionalUuid = () => z.string().uuid().nullable().optional();
const requiredString = (maxLength: number = 255) => z.string().min(1).max(maxLength);
const optionalString = (maxLength: number = 255) => z.string().min(1).max(maxLength).nullable().optional();

// Base schema without validation (for extending)
const MeditationFeedbackBaseSchema = z.object({
  // Feedback principal
  vote: MeditationVoteSchema,
  reasons: z.array(MeditationFeedbackReasonSchema).optional(),

  // Contexto da meditação
  meditation_id: requiredString(100),
  meditation_title: requiredString(255),
  meditation_duration_seconds: z.number().int().positive(),
  meditation_category: requiredString(50),

  // Métricas de sessão
  actual_play_time_seconds: z.number().int().nonnegative(),
  completion_percentage: z.number().min(0).max(100),
  pause_count: z.number().int().nonnegative().default(0),
  skip_count: z.number().int().nonnegative().default(0),
  seek_count: z.number().int().nonnegative().default(0),

  // Som de fundo (opcional)
  background_sound_id: optionalString(50),
  background_sound_title: optionalString(100),

  // Metadados
  feedback_source: z.string().default("meditation_completion"),
});

// Main meditation feedback payload schema (with validation)
export const MeditationFeedbackPayloadSchema = MeditationFeedbackBaseSchema.refine(
  (data) => {
    // Se vote é "negative", reasons deve existir e ter pelo menos 1 item
    if (data.vote === "negative") {
      return data.reasons && data.reasons.length > 0;
    }
    return true;
  },
  {
    message: "reasons are required when vote is 'negative'",
    path: ["reasons"],
  }
);

export type MeditationFeedbackPayload = z.infer<typeof MeditationFeedbackPayloadSchema>;

// Schema for the complete feedback record (includes DB fields)
export const MeditationFeedbackRecordSchema = MeditationFeedbackBaseSchema.extend({
  id: z.string().uuid(),
  user_id: optionalUuid(),
  session_id: requiredString(100),
  guest_id: optionalString(100),
  created_at: z.date(),
  updated_at: z.date(),
});

export type MeditationFeedbackRecord = z.infer<typeof MeditationFeedbackRecordSchema>;

// Success response schema
export const MeditationFeedbackSuccessSchema = z.object({
  success: z.literal(true),
  feedback_id: z.string().uuid(),
  message: z.string(),
});

export type MeditationFeedbackSuccess = z.infer<typeof MeditationFeedbackSuccessSchema>;

// Error response schema
export const MeditationFeedbackErrorSchema = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
  message: z.string().optional(),
});

export type MeditationFeedbackError = z.infer<typeof MeditationFeedbackErrorSchema>;
