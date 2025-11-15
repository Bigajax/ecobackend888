-- Fix bandit_rewards table schema to resolve CHECK constraint conflict
-- Problem: Two conflicting schema definitions exist (analytics_schema.sql vs eco_feedback_schema.sql)
-- Solution: Drop and recreate bandit_rewards with the correct schema including interaction_id

-- Step 1: Drop any dependent views first
DROP VIEW IF EXISTS analytics.eco_bandit_feedback_rewards CASCADE;
DROP VIEW IF EXISTS analytics.vw_bandit_rewards CASCADE;

-- Step 2: Drop the old problematic table
DROP TABLE IF EXISTS analytics.bandit_rewards CASCADE;

-- Step 3: Create the correct table with all required columns
CREATE TABLE analytics.bandit_rewards (
    id uuid primary key default gen_random_uuid(),
    response_id text not null,
    interaction_id uuid references analytics.eco_interactions (id) on delete cascade,
    pilar text not null,
    arm text not null,
    recompensa numeric not null,
    created_at timestamptz not null default now()
);

-- Step 4: Create indexes for common queries
CREATE INDEX bandit_rewards_response_id_idx ON analytics.bandit_rewards (response_id);
CREATE INDEX bandit_rewards_arm_idx ON analytics.bandit_rewards (arm);
CREATE INDEX bandit_rewards_created_at_idx ON analytics.bandit_rewards (created_at DESC);
CREATE INDEX bandit_rewards_interaction_id_idx ON analytics.bandit_rewards (interaction_id);
CREATE INDEX bandit_rewards_pilar_arm_created_at_idx ON analytics.bandit_rewards (pilar, arm, created_at DESC);

-- Step 5: Create unique index to prevent duplicate feedback
CREATE UNIQUE INDEX bandit_rewards_response_arm_uidx ON analytics.bandit_rewards (response_id, arm);

-- Step 6: Recreate the aggregation view
CREATE OR REPLACE VIEW analytics.eco_bandit_feedback_rewards AS
SELECT
  arm as arm_key,
  sum(case when recompensa >= 0.5 then 1 else 0 end)::bigint as feedback_count,
  sum(recompensa)::numeric as reward_sum,
  sum(recompensa * recompensa)::numeric as reward_sq_sum
FROM analytics.bandit_rewards
GROUP BY arm;

-- Step 7: Recreate legacy view for backward compatibility
CREATE OR REPLACE VIEW analytics.vw_bandit_rewards AS
SELECT
  response_id,
  interaction_id,
  pilar,
  arm,
  recompensa,
  created_at
FROM analytics.bandit_rewards;

-- Step 8: Grant all required permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON analytics.bandit_rewards TO service_role;
GRANT SELECT ON analytics.eco_bandit_feedback_rewards TO service_role;
GRANT SELECT ON analytics.vw_bandit_rewards TO service_role;
GRANT USAGE ON SCHEMA analytics TO service_role;
