-- ============================================
-- ROLLBACK Script: Analytics Security Lockdown
-- ============================================
-- Purpose: Rollback security hardening changes if issues arise.
-- Use this ONLY if the migration causes unexpected backend failures.
--
-- WARNING: This restores the insecure state. Use only for emergency rollback.
-- ============================================

-- ============================================
-- STEP 1: Disable RLS on All Analytics Tables
-- ============================================

ALTER TABLE analytics.eco_interactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_feedback DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.resposta_q DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.module_outcomes DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.knapsack_decision DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.latency_samples DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_policy_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_module_usages DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_passive_signals DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.bandit_rewards DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_bandit_arms DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Drop Deny-All Policies
-- ============================================

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.eco_interactions;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.eco_interactions;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.eco_feedback;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.eco_feedback;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.resposta_q;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.resposta_q;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.module_outcomes;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.module_outcomes;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.knapsack_decision;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.knapsack_decision;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.latency_samples;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.latency_samples;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.eco_policy_config;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.eco_policy_config;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.eco_module_usages;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.eco_module_usages;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.eco_passive_signals;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.eco_passive_signals;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.bandit_rewards;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.bandit_rewards;

DROP POLICY IF EXISTS "deny_anon_all" ON analytics.eco_bandit_arms;
DROP POLICY IF EXISTS "deny_authenticated_all" ON analytics.eco_bandit_arms;

-- ============================================
-- STEP 3: Restore service_role Grants (Optional)
-- ============================================
-- Note: service_role should still have access even after rollback,
-- but we restore grants explicitly for safety.

GRANT USAGE ON SCHEMA analytics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics TO service_role;
GRANT SELECT ON ALL VIEWS IN SCHEMA analytics TO service_role;
GRANT EXECUTE ON FUNCTION analytics.update_bandit_arm(text, numeric) TO service_role;

-- ============================================
-- Verification After Rollback
-- ============================================

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'analytics'
  AND tablename IN (
    'eco_interactions', 'eco_feedback', 'resposta_q', 'module_outcomes',
    'knapsack_decision', 'latency_samples', 'eco_policy_config',
    'eco_module_usages', 'eco_passive_signals', 'bandit_rewards', 'eco_bandit_arms'
  );

-- Expected: rowsecurity = false for all rows

-- Verify no deny policies exist
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'analytics'
  AND policyname LIKE 'deny_%';

-- Expected: Empty result set

-- ============================================
-- IMPORTANT NOTES
-- ============================================
-- 1. This rollback should NOT be needed if the migration was tested properly.
-- 2. Backend uses service_role which bypasses RLS, so disabling RLS won't
--    affect backend functionality.
-- 3. Only use this rollback if you observe unexpected errors in backend logs
--    that are clearly related to the security migration.
-- 4. After rollback, re-investigate the root cause before re-applying the
--    security hardening migration.
-- ============================================

COMMENT ON SCHEMA analytics IS
  'Analytics schema (RLS DISABLED via rollback - INSECURE STATE). '
  'Re-apply security hardening migration after fixing issues.';
