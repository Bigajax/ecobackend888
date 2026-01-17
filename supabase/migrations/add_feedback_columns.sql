-- Migration: Add missing columns to eco_feedback table
-- Description: Adds arm, pillar, message_id, prompt_hash, and timestamp columns to support bandit optimization and feedback tracking
-- Date: 2025-11-05

-- Add missing columns to analytics.eco_feedback table
ALTER TABLE analytics.eco_feedback
ADD COLUMN IF NOT EXISTS message_id TEXT,
ADD COLUMN IF NOT EXISTS arm TEXT,
ADD COLUMN IF NOT EXISTS pillar TEXT DEFAULT 'geral',
ADD COLUMN IF NOT EXISTS prompt_hash TEXT,
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;

-- Create indexes for new columns to improve query performance
CREATE INDEX IF NOT EXISTS eco_feedback_arm_idx ON analytics.eco_feedback(arm);
CREATE INDEX IF NOT EXISTS eco_feedback_pillar_idx ON analytics.eco_feedback(pillar);
CREATE INDEX IF NOT EXISTS eco_feedback_message_id_idx ON analytics.eco_feedback(message_id);
CREATE INDEX IF NOT EXISTS eco_feedback_prompt_hash_idx ON analytics.eco_feedback(prompt_hash);

-- Add comment documentation
COMMENT ON COLUMN analytics.eco_feedback.message_id IS 'Reference to the message/response ID for linking feedback to specific responses';
COMMENT ON COLUMN analytics.eco_feedback.arm IS 'The arm/module key used in the response (for multi-armed bandit optimization)';
COMMENT ON COLUMN analytics.eco_feedback.pillar IS 'The pillar/category of the feedback (e.g., geral, tecnico, emocional)';
COMMENT ON COLUMN analytics.eco_feedback.prompt_hash IS 'Hash of the prompt used for this response (for reproducibility tracking)';
COMMENT ON COLUMN analytics.eco_feedback.timestamp IS 'Timestamp when the feedback was submitted (client-side timestamp)';
