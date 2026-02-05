-- =====================================================
-- Migration: Create Program Enrollment and Progress Tables
-- Description: Tables for persisting "Quem Pensa Enriquece" program progress
-- Date: 2026-02-05
-- =====================================================

-- =====================================================
-- Table: program_enrollments
-- Purpose: Track user enrollment in programs
-- =====================================================
CREATE TABLE IF NOT EXISTS program_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  program_id VARCHAR(50) NOT NULL,

  -- Progress tracking
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step INT DEFAULT 0 CHECK (current_step >= 0),
  current_lesson TEXT,

  -- Status management
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Metadata
  duration VARCHAR(20),
  device_info JSONB
);

-- =====================================================
-- Table: program_step_answers
-- Purpose: Store user answers for each program step
-- =====================================================
CREATE TABLE IF NOT EXISTS program_step_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
  step_number INT NOT NULL CHECK (step_number >= 1 AND step_number <= 6),

  -- Flexible answer storage
  answers JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: One answer set per step per enrollment
  CONSTRAINT unique_step_per_enrollment
    UNIQUE (enrollment_id, step_number)
);

-- =====================================================
-- Table: program_ai_feedback (Optional - for future use)
-- Purpose: Store AI feedback history for program steps
-- =====================================================
CREATE TABLE IF NOT EXISTS program_ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
  step_number INT NOT NULL,

  -- Feedback data
  user_input TEXT NOT NULL,
  ai_feedback TEXT NOT NULL,

  -- Quality rating (optional)
  feedback_rating INT CHECK (feedback_rating IN (-1, 0, 1)),

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON program_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON program_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_program ON program_enrollments(program_id);
CREATE INDEX IF NOT EXISTS idx_answers_enrollment ON program_step_answers(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_feedback_enrollment ON program_ai_feedback(enrollment_id);

-- Partial unique index: Only one active enrollment per user per program
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_enrollment
  ON program_enrollments(user_id, program_id)
  WHERE status = 'in_progress';

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_step_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_ai_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own enrollments
CREATE POLICY "users_read_own_enrollments"
  ON program_enrollments FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own enrollments
CREATE POLICY "users_insert_own_enrollments"
  ON program_enrollments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own enrollments
CREATE POLICY "users_update_own_enrollments"
  ON program_enrollments FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own enrollments (abandon)
CREATE POLICY "users_delete_own_enrollments"
  ON program_enrollments FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Users can read answers from their own enrollments
CREATE POLICY "users_read_own_answers"
  ON program_step_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM program_enrollments
      WHERE program_enrollments.id = program_step_answers.enrollment_id
        AND program_enrollments.user_id = auth.uid()
    )
  );

-- Policy: Users can insert answers to their own enrollments
CREATE POLICY "users_insert_own_answers"
  ON program_step_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM program_enrollments
      WHERE program_enrollments.id = program_step_answers.enrollment_id
        AND program_enrollments.user_id = auth.uid()
    )
  );

-- Policy: Users can update answers from their own enrollments
CREATE POLICY "users_update_own_answers"
  ON program_step_answers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM program_enrollments
      WHERE program_enrollments.id = program_step_answers.enrollment_id
        AND program_enrollments.user_id = auth.uid()
    )
  );

-- Policy: Users can delete answers from their own enrollments
CREATE POLICY "users_delete_own_answers"
  ON program_step_answers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM program_enrollments
      WHERE program_enrollments.id = program_step_answers.enrollment_id
        AND program_enrollments.user_id = auth.uid()
    )
  );

-- Policy: Users can read feedback from their own enrollments
CREATE POLICY "users_read_own_feedback"
  ON program_ai_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM program_enrollments
      WHERE program_enrollments.id = program_ai_feedback.enrollment_id
        AND program_enrollments.user_id = auth.uid()
    )
  );

-- Policy: Users can insert feedback to their own enrollments
CREATE POLICY "users_insert_own_feedback"
  ON program_ai_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM program_enrollments
      WHERE program_enrollments.id = program_ai_feedback.enrollment_id
        AND program_enrollments.user_id = auth.uid()
    )
  );

-- =====================================================
-- Comments for Documentation
-- =====================================================
COMMENT ON TABLE program_enrollments IS 'Tracks user enrollments in programs like "Quem Pensa Enriquece"';
COMMENT ON TABLE program_step_answers IS 'Stores user answers for each step in a program';
COMMENT ON TABLE program_ai_feedback IS 'Stores AI-generated feedback for user responses (optional)';

COMMENT ON COLUMN program_enrollments.program_id IS 'Program identifier (e.g., "rec_2" for Quem Pensa Enriquece)';
COMMENT ON COLUMN program_enrollments.status IS 'Enrollment status: in_progress, completed, or abandoned';
COMMENT ON COLUMN program_step_answers.answers IS 'JSON object containing step-specific answers';
COMMENT ON COLUMN program_ai_feedback.feedback_rating IS 'User rating: -1 (dislike), 0 (neutral), 1 (like)';
