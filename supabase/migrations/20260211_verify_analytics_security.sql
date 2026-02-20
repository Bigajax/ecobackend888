-- ============================================
-- Verification Script: Analytics Security Lockdown
-- ============================================
-- Purpose: Verify that RLS is enabled, policies are active,
-- and permissions are correctly configured.
--
-- Run this script AFTER applying 20260211_harden_analytics_security.sql
-- ============================================

-- ============================================
-- 1. Verify RLS is Enabled on All Analytics Tables
-- ============================================

SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'analytics'
  AND tablename IN (
    'eco_interactions', 'eco_feedback', 'resposta_q', 'module_outcomes',
    'knapsack_decision', 'latency_samples', 'eco_policy_config',
    'eco_module_usages', 'eco_passive_signals', 'bandit_rewards', 'eco_bandit_arms'
  )
ORDER BY tablename;

-- Expected: All rows should have rls_enabled = true

-- ============================================
-- 2. Verify anon/authenticated Have NO Direct Grants
-- ============================================

SELECT
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'analytics'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, table_name;

-- Expected: Empty result set (no grants)

-- ============================================
-- 3. Verify View Permissions (anon/authenticated blocked)
-- ============================================

SELECT
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'analytics'
  AND table_name IN (
    'vw_interactions', 'eco_bandit_feedback_rewards',
    'vw_module_usages', 'vw_bandit_rewards',
    'v_feedback_recent', 'v_interactions_recent', 'v_latency_recent'
  )
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, table_name;

-- Expected: Empty result set (no grants)

-- ============================================
-- 4. Verify Deny-All Policies Are Active
-- ============================================

SELECT
    schemaname,
    tablename,
    policyname,
    roles,
    cmd,
    CASE
        WHEN qual = 'false'::text THEN 'DENY_ALL'
        ELSE qual
    END as policy_condition
FROM pg_policies
WHERE schemaname = 'analytics'
  AND policyname LIKE 'deny_%'
ORDER BY tablename, policyname;

-- Expected: 2 policies per table (deny_anon_all, deny_authenticated_all)
-- policy_condition should be 'DENY_ALL' (qual = 'false')

-- ============================================
-- 5. Verify service_role Has Full Access
-- ============================================

SELECT
    grantee,
    table_schema,
    table_name,
    string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
FROM information_schema.table_privileges
WHERE table_schema = 'analytics'
  AND grantee = 'service_role'
  AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
GROUP BY grantee, table_schema, table_name
ORDER BY table_name;

-- Expected: service_role should have all privileges (DELETE, INSERT, SELECT, UPDATE)
-- on all analytics tables

-- ============================================
-- 6. Verify Function Permissions
-- ============================================

SELECT
    r.rolname as grantee,
    n.nspname as schema,
    p.proname as function_name,
    pg_catalog.pg_get_function_arguments(p.oid) as arguments,
    CASE
        WHEN has_function_privilege(r.oid, p.oid, 'EXECUTE') THEN 'EXECUTE'
        ELSE 'NO ACCESS'
    END as privilege
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'analytics'
  AND p.proname = 'update_bandit_arm'
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

-- Expected:
-- - anon: NO ACCESS
-- - authenticated: NO ACCESS
-- - service_role: EXECUTE

-- ============================================
-- 7. Count Deny Policies Per Table
-- ============================================

SELECT
    tablename,
    COUNT(*) as deny_policies_count
FROM pg_policies
WHERE schemaname = 'analytics'
  AND policyname LIKE 'deny_%'
GROUP BY tablename
ORDER BY tablename;

-- Expected: Each table should have 2 deny policies
-- (one for anon, one for authenticated)

-- ============================================
-- 8. Test Access Control (Simulation)
-- ============================================

-- Note: These are simulation queries. To truly test anon/authenticated
-- lockdown, you need to use Supabase PostgREST API with anon key.
--
-- Example test command (run in terminal):
--
-- curl -X GET "https://YOUR_PROJECT.supabase.co/rest/v1/eco_interactions?select=*&limit=1" \
--   -H "apikey: YOUR_SUPABASE_ANON_KEY" \
--   -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"
--
-- Expected Response: 401 Unauthorized OR [] (empty array)

-- ============================================
-- Summary Query
-- ============================================

SELECT
    'Analytics Security Audit' as audit_type,
    (SELECT COUNT(*) FROM pg_tables
     WHERE schemaname = 'analytics' AND rowsecurity = true) as tables_with_rls,
    (SELECT COUNT(*) FROM pg_policies
     WHERE schemaname = 'analytics' AND policyname LIKE 'deny_%') as deny_policies_count,
    (SELECT COUNT(*) FROM information_schema.table_privileges
     WHERE table_schema = 'analytics' AND grantee IN ('anon', 'authenticated')) as anon_auth_grants,
    (SELECT COUNT(DISTINCT table_name) FROM information_schema.table_privileges
     WHERE table_schema = 'analytics' AND grantee = 'service_role') as service_role_access_count;

-- Expected:
-- - tables_with_rls: 11 (all analytics tables)
-- - deny_policies_count: 22 (2 per table)
-- - anon_auth_grants: 0 (zero grants)
-- - service_role_access_count: 11 (access to all tables)

-- ============================================
-- If any verification fails, check:
-- 1. Migration was applied successfully
-- 2. No conflicting grants were added after migration
-- 3. Supabase dashboard RLS toggle matches script results
-- ============================================
