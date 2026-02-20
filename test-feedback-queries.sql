-- ============================================================================
-- TEST A1: Feedback System - SQL Verification Queries
-- ============================================================================
-- Run these queries in your Supabase SQL editor to verify feedback collection
-- ============================================================================

-- ============================================================================
-- QUERY 1: Recent Feedback Records
-- ============================================================================
-- Shows the last 10 feedback votes submitted
SELECT
  f.id,
  f.interaction_id,
  f.vote,
  f.reason,
  f.pillar,
  f.created_at,
  f.user_id,
  f.guest_id
FROM analytics.eco_feedback f
ORDER BY f.created_at DESC
LIMIT 10;

-- ============================================================================
-- QUERY 2: Bandit Rewards (Linked to Feedback)
-- ============================================================================
-- Shows reward signals that were recorded from feedback
SELECT
  br.id,
  br.interaction_id,
  br.arm,
  br.reward,
  br.created_at,
  br.quality_score,
  br.like_signal,
  br.reply_signal,
  br.memory_signal
FROM analytics.bandit_rewards br
ORDER BY br.created_at DESC
LIMIT 10;

-- ============================================================================
-- QUERY 3: Module Usages (Shows Which Modules Were Used)
-- ============================================================================
-- Shows which modules/arms were used for each interaction
SELECT
  mu.interaction_id,
  mu.module_key,
  mu.position,
  mu.size_bytes,
  mu.tokens_est,
  mu.created_at
FROM analytics.eco_module_usages mu
WHERE mu.created_at > NOW() - INTERVAL '1 hour'
ORDER BY mu.interaction_id DESC, mu.position ASC
LIMIT 20;

-- ============================================================================
-- QUERY 4: Feedback + Module Usage Join
-- ============================================================================
-- Links feedback with the modules that were actually used
SELECT
  f.interaction_id,
  f.vote,
  f.reason,
  f.created_at as feedback_time,
  STRING_AGG(mu.module_key, ', ') as modules_used,
  COUNT(mu.module_key) as module_count
FROM analytics.eco_feedback f
LEFT JOIN analytics.eco_module_usages mu ON f.interaction_id = mu.interaction_id
WHERE f.created_at > NOW() - INTERVAL '1 hour'
GROUP BY f.interaction_id, f.vote, f.reason, f.created_at
ORDER BY f.created_at DESC
LIMIT 10;

-- ============================================================================
-- QUERY 5: Arm Inference Check (Key for Bandit!)
-- ============================================================================
-- Shows the first module (arm) used per interaction - this is what gets inferred
SELECT
  interaction_id,
  module_key as inferred_arm,
  position,
  created_at
FROM analytics.eco_module_usages
WHERE position = 1
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- QUERY 6: Bandit Arms State (Historical)
-- ============================================================================
-- Shows the current arm statistics (alpha, beta, etc)
SELECT
  arm_key,
  pulls,
  wins,
  alpha,
  beta,
  reward_sum,
  reward_sq_sum,
  created_at,
  updated_at
FROM analytics.eco_bandit_arms
ORDER BY pulls DESC
LIMIT 15;

-- ============================================================================
-- QUERY 7: Feedback Statistics (Last 24h)
-- ============================================================================
-- Aggregate feedback stats
SELECT
  vote,
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage,
  STRING_AGG(DISTINCT reason, ', ') as reasons
FROM analytics.eco_feedback
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY vote
ORDER BY count DESC;

-- ============================================================================
-- QUERY 8: Module Performance via Feedback
-- ============================================================================
-- Which modules are getting positive vs negative feedback
SELECT
  mu.module_key,
  f.vote,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY mu.module_key), 1) as percentage
FROM analytics.eco_module_usages mu
JOIN analytics.eco_feedback f ON mu.interaction_id = f.interaction_id
WHERE mu.created_at > NOW() - INTERVAL '24 hours'
  AND mu.position = 1  -- Only first module (main arm)
GROUP BY mu.module_key, f.vote
ORDER BY mu.module_key, count DESC;

-- ============================================================================
-- QUERY 9: Interactions Count Check
-- ============================================================================
-- Overall interaction stats
SELECT
  COUNT(*) as total_interactions,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as last_1h,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
  MAX(created_at) as last_interaction
FROM analytics.eco_interactions;

-- ============================================================================
-- QUERY 10: Feedback Coverage Check
-- ============================================================================
-- Shows what percentage of interactions have feedback
SELECT
  COUNT(DISTINCT i.id) as total_interactions,
  COUNT(DISTINCT f.interaction_id) as interactions_with_feedback,
  ROUND(100.0 * COUNT(DISTINCT f.interaction_id) / COUNT(DISTINCT i.id), 1) as feedback_coverage_percent
FROM analytics.eco_interactions i
LEFT JOIN analytics.eco_feedback f ON i.id = f.interaction_id
WHERE i.created_at > NOW() - INTERVAL '24 hours';

-- ============================================================================
-- DEBUG: If Feedback Submission Failed
-- ============================================================================
-- Check if there are any errors in recent feedback processing

-- Table: eco_interactions (to verify interaction exists)
SELECT
  id,
  user_id,
  guest_id,
  message_id,
  prompt_hash,
  created_at
FROM analytics.eco_interactions
ORDER BY created_at DESC
LIMIT 5;

-- Table: eco_module_usages (to verify module tracking)
SELECT
  interaction_id,
  module_key,
  position,
  created_at
FROM analytics.eco_module_usages
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- CLEANUP: Delete Test Feedback (if needed)
-- ============================================================================
-- Uncomment to delete recent test feedback
-- DELETE FROM analytics.eco_feedback
-- WHERE created_at > NOW() - INTERVAL '1 hour';
--
-- DELETE FROM analytics.bandit_rewards
-- WHERE created_at > NOW() - INTERVAL '1 hour';
