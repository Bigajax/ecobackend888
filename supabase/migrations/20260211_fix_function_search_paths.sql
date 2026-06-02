-- ============================================
-- Fix Function Search Path Mutable Warnings
-- ============================================
-- Purpose: Set explicit search_path on functions to prevent SQL injection
-- Date: 2026-02-11
--
-- This addresses Supabase linter warning: function_search_path_mutable
--
-- Affected Functions (11):
--   - analytics.update_bandit_arm
--   - public.buscar_memorias_semanticas
--   - public.update_heuristicas_embeddings_updated_at
--   - public.inserir_heuristica
--   - public.get_ritual_with_answers
--   - public.update_updated_at_column
--   - public.set_token_count_referencias
--   - public.buscar_heuristica_completa
--   - public.get_feedback_stats
--   - public.buscar_heuristica_semelhante
-- ============================================

-- ============================================
-- Fix analytics.update_bandit_arm
-- ============================================

-- Drop and recreate with SET search_path
DROP FUNCTION IF EXISTS analytics.update_bandit_arm(text, numeric);

CREATE OR REPLACE FUNCTION analytics.update_bandit_arm(p_arm_key text, p_reward numeric)
RETURNS void
LANGUAGE plpgsql
SET search_path = analytics, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT exists(SELECT 1 FROM analytics.eco_bandit_arms WHERE arm_key = p_arm_key) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO analytics.eco_bandit_arms (arm_key, pulls, alpha, beta, reward_sum, reward_sq_sum, last_update)
    VALUES (p_arm_key, 0, 1, 1, 0, 0, now());
  END IF;

  UPDATE analytics.eco_bandit_arms
  SET pulls        = pulls + 1,
      alpha        = alpha + CASE WHEN p_reward >= 0.5 THEN 1 ELSE 0 END,
      beta         = beta  + CASE WHEN p_reward <  0.5 THEN 1 ELSE 0 END,
      reward_sum   = reward_sum   + p_reward,
      reward_sq_sum= reward_sq_sum+ p_reward * p_reward,
      last_update  = now()
  WHERE arm_key = p_arm_key;
END
$$;

COMMENT ON FUNCTION analytics.update_bandit_arm(text, numeric) IS
  'Updates bandit arm statistics with explicit search_path to prevent SQL injection';

-- Restore permissions
GRANT EXECUTE ON FUNCTION analytics.update_bandit_arm(text, numeric) TO service_role;
REVOKE ALL ON FUNCTION analytics.update_bandit_arm(text, numeric) FROM anon;
REVOKE ALL ON FUNCTION analytics.update_bandit_arm(text, numeric) FROM authenticated;

-- ============================================
-- Fix public.update_updated_at_column
-- ============================================

-- This is a common trigger function - set search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column() IS
  'Trigger function to auto-update updated_at timestamp with secure search_path';

-- ============================================
-- Fix public.update_heuristicas_embeddings_updated_at
-- ============================================

CREATE OR REPLACE FUNCTION public.update_heuristicas_embeddings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_heuristicas_embeddings_updated_at() IS
  'Trigger function to update heuristicas_embeddings timestamp with secure search_path';

-- ============================================
-- NOTES FOR REMAINING FUNCTIONS
-- ============================================

-- The following functions need to be recreated with SET search_path:
--
-- 1. public.buscar_memorias_semanticas
--    - Complex semantic search function
--    - Requires reading original definition to preserve logic
--
-- 2. public.inserir_heuristica
--    - Heuristic insertion function
--    - Requires reading original definition
--
-- 3. public.get_ritual_with_answers
--    - Ritual data retrieval
--    - Requires reading original definition
--
-- 4. public.set_token_count_referencias
--    - Token counting function
--    - Requires reading original definition
--
-- 5. public.buscar_heuristica_completa
--    - Complete heuristic search
--    - Requires reading original definition
--
-- 6. public.get_feedback_stats
--    - Feedback statistics aggregation
--    - Requires reading original definition
--
-- 7. public.buscar_heuristica_semelhante
--    - Similar heuristic search
--    - Requires reading original definition
--
-- To fix these, we need to:
-- 1. Get the current function definition
-- 2. Add "SET search_path = public, pg_temp" to each
-- 3. Recreate the function
--
-- This can be done by running:
-- \df+ public.function_name
-- Or querying pg_proc directly

-- ============================================
-- Verification Query
-- ============================================

-- Run this to check which functions still need fixing:
/*
SELECT
    n.nspname as schema,
    p.proname as function_name,
    pg_catalog.pg_get_function_arguments(p.oid) as arguments,
    CASE
        WHEN p.proconfig IS NULL THEN 'NO search_path set'
        WHEN array_to_string(p.proconfig, ', ') LIKE '%search_path%' THEN 'search_path set'
        ELSE 'Other config'
    END as search_path_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('public', 'analytics')
  AND p.proname IN (
    'update_bandit_arm',
    'buscar_memorias_semanticas',
    'update_heuristicas_embeddings_updated_at',
    'inserir_heuristica',
    'get_ritual_with_answers',
    'update_updated_at_column',
    'set_token_count_referencias',
    'buscar_heuristica_completa',
    'get_feedback_stats',
    'buscar_heuristica_semelhante'
  )
ORDER BY n.nspname, p.proname;
*/

-- ============================================
-- Migration Complete
-- ============================================

-- Fixed functions (3/11):
-- ✅ analytics.update_bandit_arm
-- ✅ public.update_updated_at_column
-- ✅ public.update_heuristicas_embeddings_updated_at
--
-- Remaining functions (8/11):
-- ⏳ Require original definition to recreate safely
-- ⏳ Can be fixed in follow-up migration after reviewing definitions
