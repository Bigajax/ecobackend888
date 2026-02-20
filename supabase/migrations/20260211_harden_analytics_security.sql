-- ============================================
-- Security Hardening: Analytics Tables RLS & Permission Lockdown
-- ============================================
-- Date: 2026-02-11
-- Purpose: Enable RLS and block anon/authenticated access to all analytics tables
--
-- Context: All analytics tables are EXCLUSIVELY accessed via service_role backend clients.
-- The frontend NEVER reads from these tables directly. Public endpoints (/api/signal,
-- /api/feedback) are write-only; the backend internally uses service_role to persist data.
--
-- Goal: Zero-risk security posture by blocking all anon/authenticated access while
-- maintaining full backend functionality.
--
-- Affected Tables (11):
--   - analytics.eco_interactions
--   - analytics.eco_feedback
--   - analytics.resposta_q
--   - analytics.module_outcomes
--   - analytics.knapsack_decision
--   - analytics.latency_samples
--   - analytics.eco_policy_config
--   - analytics.eco_module_usages
--   - analytics.eco_passive_signals
--   - analytics.bandit_rewards
--   - analytics.eco_bandit_arms
--
-- Affected Views (7):
--   - analytics.vw_interactions
--   - analytics.eco_bandit_feedback_rewards
--   - analytics.vw_module_usages
--   - analytics.vw_bandit_rewards
--   - analytics.v_feedback_recent
--   - analytics.v_interactions_recent
--   - analytics.v_latency_recent
-- ============================================

-- ============================================
-- STEP 1: Enable RLS on All Analytics Tables
-- ============================================

ALTER TABLE analytics.eco_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.resposta_q ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.module_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.knapsack_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.latency_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_policy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_module_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_passive_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.bandit_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.eco_bandit_arms ENABLE ROW LEVEL SECURITY;

-- Note: service_role automatically bypasses RLS

-- ============================================
-- STEP 2: Revoke Direct Permissions from anon/authenticated
-- ============================================

-- Revoke all table permissions from anon
REVOKE ALL ON analytics.eco_interactions FROM anon;
REVOKE ALL ON analytics.eco_feedback FROM anon;
REVOKE ALL ON analytics.resposta_q FROM anon;
REVOKE ALL ON analytics.module_outcomes FROM anon;
REVOKE ALL ON analytics.knapsack_decision FROM anon;
REVOKE ALL ON analytics.latency_samples FROM anon;
REVOKE ALL ON analytics.eco_policy_config FROM anon;
REVOKE ALL ON analytics.eco_module_usages FROM anon;
REVOKE ALL ON analytics.eco_passive_signals FROM anon;
REVOKE ALL ON analytics.bandit_rewards FROM anon;
REVOKE ALL ON analytics.eco_bandit_arms FROM anon;

-- Revoke all table permissions from authenticated
REVOKE ALL ON analytics.eco_interactions FROM authenticated;
REVOKE ALL ON analytics.eco_feedback FROM authenticated;
REVOKE ALL ON analytics.resposta_q FROM authenticated;
REVOKE ALL ON analytics.module_outcomes FROM authenticated;
REVOKE ALL ON analytics.knapsack_decision FROM authenticated;
REVOKE ALL ON analytics.latency_samples FROM authenticated;
REVOKE ALL ON analytics.eco_policy_config FROM authenticated;
REVOKE ALL ON analytics.eco_module_usages FROM authenticated;
REVOKE ALL ON analytics.eco_passive_signals FROM authenticated;
REVOKE ALL ON analytics.bandit_rewards FROM authenticated;
REVOKE ALL ON analytics.eco_bandit_arms FROM authenticated;

-- Revoke function permissions from anon/authenticated
REVOKE ALL ON FUNCTION analytics.update_bandit_arm(text, numeric) FROM anon;
REVOKE ALL ON FUNCTION analytics.update_bandit_arm(text, numeric) FROM authenticated;

-- Explicitly confirm service_role retains full access (redundant but safe)
GRANT ALL ON ALL TABLES IN SCHEMA analytics TO service_role;
GRANT EXECUTE ON FUNCTION analytics.update_bandit_arm(text, numeric) TO service_role;

-- ============================================
-- STEP 3: Create Explicit "Deny All" Policies
-- ============================================

-- eco_interactions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_interactions'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.eco_interactions
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_interactions'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.eco_interactions
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- eco_feedback
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_feedback'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.eco_feedback
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_feedback'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.eco_feedback
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- resposta_q
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'resposta_q'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.resposta_q
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'resposta_q'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.resposta_q
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- module_outcomes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'module_outcomes'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.module_outcomes
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'module_outcomes'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.module_outcomes
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- knapsack_decision
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'knapsack_decision'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.knapsack_decision
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'knapsack_decision'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.knapsack_decision
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- latency_samples
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'latency_samples'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.latency_samples
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'latency_samples'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.latency_samples
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- eco_policy_config
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_policy_config'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.eco_policy_config
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_policy_config'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.eco_policy_config
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- eco_module_usages
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_module_usages'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.eco_module_usages
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_module_usages'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.eco_module_usages
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- eco_passive_signals
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_passive_signals'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.eco_passive_signals
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_passive_signals'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.eco_passive_signals
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- bandit_rewards
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'bandit_rewards'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.bandit_rewards
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'bandit_rewards'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.bandit_rewards
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- eco_bandit_arms
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_bandit_arms'
        AND policyname = 'deny_anon_all'
    ) THEN
        CREATE POLICY "deny_anon_all" ON analytics.eco_bandit_arms
            FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'analytics'
        AND tablename = 'eco_bandit_arms'
        AND policyname = 'deny_authenticated_all'
    ) THEN
        CREATE POLICY "deny_authenticated_all" ON analytics.eco_bandit_arms
            FOR ALL TO authenticated USING (false) WITH CHECK (false);
    END IF;
END $$;

-- ============================================
-- STEP 4: Secure Security Definer Views
-- ============================================

-- Revoke anon/authenticated access to all analytics views
REVOKE ALL ON analytics.vw_interactions FROM anon, authenticated;
REVOKE ALL ON analytics.eco_bandit_feedback_rewards FROM anon, authenticated;
REVOKE ALL ON analytics.vw_module_usages FROM anon, authenticated;
REVOKE ALL ON analytics.vw_bandit_rewards FROM anon, authenticated;
REVOKE ALL ON analytics.v_feedback_recent FROM anon, authenticated;
REVOKE ALL ON analytics.v_interactions_recent FROM anon, authenticated;
REVOKE ALL ON analytics.v_latency_recent FROM anon, authenticated;

-- Explicitly grant SELECT to service_role (redundant but safe)
GRANT SELECT ON analytics.vw_interactions TO service_role;
GRANT SELECT ON analytics.eco_bandit_feedback_rewards TO service_role;
GRANT SELECT ON analytics.vw_module_usages TO service_role;
GRANT SELECT ON analytics.vw_bandit_rewards TO service_role;
GRANT SELECT ON analytics.v_feedback_recent TO service_role;
GRANT SELECT ON analytics.v_interactions_recent TO service_role;
GRANT SELECT ON analytics.v_latency_recent TO service_role;

-- ============================================
-- VERIFICATION COMMENTS
-- ============================================

COMMENT ON SCHEMA analytics IS
  'Analytics schema with full RLS lockdown. All tables accessible ONLY via service_role. '
  'anon/authenticated roles are explicitly denied via RLS policies. '
  'Frontend never accesses these tables directly. Backend uses service_role exclusively.';

-- ============================================
-- Security Impact Summary
-- ============================================
-- Before:
--   ❌ RLS disabled on 11 analytics tables
--   ❌ Potentially accessible via PostgREST API with anon key
--   ❌ Sensitive columns (session_id) exposed
--   ❌ Security definer views without access control
--
-- After:
--   ✅ RLS enabled on all analytics tables
--   ✅ Explicit deny-all policies for anon/authenticated
--   ✅ All direct permissions revoked from anon/authenticated
--   ✅ Security definer views locked to service_role only
--   ✅ Backend service_role access unchanged (bypasses RLS)
--   ✅ Zero risk of client-side analytics data exposure
--
-- Zero Breaking Changes: Backend uses service_role exclusively,
-- which bypasses RLS. Frontend never accessed these tables.
-- ============================================
