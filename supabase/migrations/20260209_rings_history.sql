-- =====================================================
-- Five Rings History System - Database Schema
-- Created: 2026-02-09
-- Description: Persistent storage for daily rituals
-- =====================================================

-- =====================================================
-- 1. CREATE TABLES
-- =====================================================

-- Main table: daily rituals (one per user per day)
CREATE TABLE IF NOT EXISTS daily_rituals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraint: one ritual per user per day
  CONSTRAINT daily_rituals_user_date_unique UNIQUE(user_id, date)
);

-- Answers table: 5 ring answers per ritual
CREATE TABLE IF NOT EXISTS ring_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_id UUID NOT NULL REFERENCES daily_rituals(id) ON DELETE CASCADE,
  ring_id VARCHAR(10) NOT NULL CHECK (ring_id IN ('earth', 'water', 'fire', 'wind', 'void')),
  answer TEXT NOT NULL,
  metadata JSONB,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraint: one answer per ring per ritual
  CONSTRAINT ring_answers_ritual_ring_unique UNIQUE(ritual_id, ring_id)
);

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

-- Performance indexes for daily_rituals
CREATE INDEX IF NOT EXISTS idx_daily_rituals_user
  ON daily_rituals(user_id);

CREATE INDEX IF NOT EXISTS idx_daily_rituals_date
  ON daily_rituals(date);

CREATE INDEX IF NOT EXISTS idx_daily_rituals_status
  ON daily_rituals(status);

CREATE INDEX IF NOT EXISTS idx_daily_rituals_user_date
  ON daily_rituals(user_id, date DESC);

-- Partial index for completed rituals (faster queries)
CREATE INDEX IF NOT EXISTS idx_daily_rituals_completed
  ON daily_rituals(user_id, completed_at DESC)
  WHERE status = 'completed';

-- Performance indexes for ring_answers
CREATE INDEX IF NOT EXISTS idx_ring_answers_ritual
  ON ring_answers(ritual_id);

CREATE INDEX IF NOT EXISTS idx_ring_answers_ring_id
  ON ring_answers(ring_id);

-- GIN index for JSONB metadata queries
CREATE INDEX IF NOT EXISTS idx_ring_answers_metadata
  ON ring_answers USING GIN (metadata);

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on both tables
ALTER TABLE daily_rituals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ring_answers ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3.1 RLS Policies for daily_rituals
-- =====================================================

-- Policy: Users can SELECT their own rituals
DROP POLICY IF EXISTS daily_rituals_user_select ON daily_rituals;
CREATE POLICY daily_rituals_user_select ON daily_rituals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can INSERT their own rituals
DROP POLICY IF EXISTS daily_rituals_user_insert ON daily_rituals;
CREATE POLICY daily_rituals_user_insert ON daily_rituals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can UPDATE their own rituals
DROP POLICY IF EXISTS daily_rituals_user_update ON daily_rituals;
CREATE POLICY daily_rituals_user_update ON daily_rituals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can DELETE their own rituals
DROP POLICY IF EXISTS daily_rituals_user_delete ON daily_rituals;
CREATE POLICY daily_rituals_user_delete ON daily_rituals
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- 3.2 RLS Policies for ring_answers
-- =====================================================

-- Policy: Users can SELECT answers for their own rituals
DROP POLICY IF EXISTS ring_answers_user_select ON ring_answers;
CREATE POLICY ring_answers_user_select ON ring_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM daily_rituals
      WHERE daily_rituals.id = ring_answers.ritual_id
      AND daily_rituals.user_id = auth.uid()
    )
  );

-- Policy: Users can INSERT answers for their own rituals
DROP POLICY IF EXISTS ring_answers_user_insert ON ring_answers;
CREATE POLICY ring_answers_user_insert ON ring_answers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_rituals
      WHERE daily_rituals.id = ring_answers.ritual_id
      AND daily_rituals.user_id = auth.uid()
    )
  );

-- Policy: Users can UPDATE answers for their own rituals
DROP POLICY IF EXISTS ring_answers_user_update ON ring_answers;
CREATE POLICY ring_answers_user_update ON ring_answers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM daily_rituals
      WHERE daily_rituals.id = ring_answers.ritual_id
      AND daily_rituals.user_id = auth.uid()
    )
  );

-- Policy: Users can DELETE answers for their own rituals
DROP POLICY IF EXISTS ring_answers_user_delete ON ring_answers;
CREATE POLICY ring_answers_user_delete ON ring_answers
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM daily_rituals
      WHERE daily_rituals.id = ring_answers.ritual_id
      AND daily_rituals.user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. HELPER FUNCTIONS (Optional)
-- =====================================================

-- Function: Get ritual with answers (optimized query)
CREATE OR REPLACE FUNCTION get_ritual_with_answers(
  p_ritual_id UUID
)
RETURNS TABLE (
  ritual_id UUID,
  user_id UUID,
  date DATE,
  status VARCHAR,
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  answers JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dr.id AS ritual_id,
    dr.user_id,
    dr.date,
    dr.status,
    dr.notes,
    dr.completed_at,
    dr.started_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ra.id,
          'ringId', ra.ring_id,
          'answer', ra.answer,
          'metadata', ra.metadata,
          'answeredAt', ra.answered_at
        )
        ORDER BY
          CASE ra.ring_id
            WHEN 'earth' THEN 1
            WHEN 'water' THEN 2
            WHEN 'fire' THEN 3
            WHEN 'wind' THEN 4
            WHEN 'void' THEN 5
          END
      ) FILTER (WHERE ra.id IS NOT NULL),
      '[]'::jsonb
    ) AS answers
  FROM daily_rituals dr
  LEFT JOIN ring_answers ra ON ra.ritual_id = dr.id
  WHERE dr.id = p_ritual_id
  AND dr.user_id = auth.uid() -- RLS check
  GROUP BY dr.id;
END;
$$;

-- =====================================================
-- 5. VERIFICATION QUERIES (Comment out after testing)
-- =====================================================

-- Test 1: Verify tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('daily_rituals', 'ring_answers');

-- Test 2: Verify indexes exist
-- SELECT indexname FROM pg_indexes
-- WHERE tablename IN ('daily_rituals', 'ring_answers');

-- Test 3: Verify RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('daily_rituals', 'ring_answers');

-- Test 4: Verify policies exist
-- SELECT policyname, tablename FROM pg_policies
-- WHERE tablename IN ('daily_rituals', 'ring_answers');

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- To apply this migration:
-- 1. Connect to Supabase database
-- 2. Run: psql -h <host> -U <user> -d <database> -f 20260209_rings_history.sql
-- Or use Supabase Dashboard > SQL Editor

-- To rollback (if needed):
-- DROP TABLE IF EXISTS ring_answers CASCADE;
-- DROP TABLE IF EXISTS daily_rituals CASCADE;
-- DROP FUNCTION IF EXISTS get_ritual_with_answers;
