-- Migration: Create meditation_feedback table
-- Created: 2025-12-19
-- Description: Stores user feedback for meditation sessions with metrics and context

-- Create meditation_feedback table in analytics schema
CREATE TABLE IF NOT EXISTS analytics.meditation_feedback (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Feedback principal
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('positive', 'negative')),
  reasons TEXT[], -- Array de strings: ['too_long', 'hard_to_focus', 'voice_music', 'other']

  -- Contexto da meditação
  meditation_id VARCHAR(100) NOT NULL,
  meditation_title VARCHAR(255) NOT NULL,
  meditation_duration_seconds INTEGER NOT NULL,
  meditation_category VARCHAR(50) NOT NULL, -- 'energy_blessings', 'dr_joe_dispenza', etc.

  -- Métricas de sessão
  actual_play_time_seconds INTEGER NOT NULL,
  completion_percentage DECIMAL(5,2) NOT NULL CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  pause_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  seek_count INTEGER DEFAULT 0,

  -- Som de fundo
  background_sound_id VARCHAR(50),
  background_sound_title VARCHAR(100),

  -- Identidade do usuário (3 níveis)
  user_id UUID, -- NULL se guest (sem FK para auth.users pois pode não existir)
  session_id VARCHAR(100) NOT NULL,
  guest_id VARCHAR(100),

  -- Metadados
  feedback_source VARCHAR(50) DEFAULT 'meditation_completion',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Índices para performance
  CONSTRAINT valid_user CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_meditation_feedback_user_id
  ON analytics.meditation_feedback(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meditation_feedback_meditation_id
  ON analytics.meditation_feedback(meditation_id);

CREATE INDEX IF NOT EXISTS idx_meditation_feedback_category
  ON analytics.meditation_feedback(meditation_category);

CREATE INDEX IF NOT EXISTS idx_meditation_feedback_vote
  ON analytics.meditation_feedback(vote);

CREATE INDEX IF NOT EXISTS idx_meditation_feedback_created_at
  ON analytics.meditation_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meditation_feedback_session_id
  ON analytics.meditation_feedback(session_id);

-- Criar função para atualizar updated_at (se não existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_meditation_feedback_updated_at ON analytics.meditation_feedback;
CREATE TRIGGER update_meditation_feedback_updated_at
  BEFORE UPDATE ON analytics.meditation_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to service role
GRANT SELECT, INSERT, UPDATE, DELETE ON analytics.meditation_feedback TO service_role;

-- Row Level Security (RLS) Policies

-- Habilitar RLS
ALTER TABLE analytics.meditation_feedback ENABLE ROW LEVEL SECURITY;

-- Política: Permitir INSERT para usuários autenticados e guests
CREATE POLICY "Allow insert meditation feedback"
ON analytics.meditation_feedback
FOR INSERT
WITH CHECK (
  -- Usuário autenticado pode inserir com seu user_id
  (auth.uid() = user_id)
  OR
  -- Guest pode inserir com guest_id (sem user_id)
  (user_id IS NULL AND guest_id IS NOT NULL)
  OR
  -- Service role pode inserir qualquer coisa
  (auth.role() = 'service_role')
);

-- Política: Permitir SELECT apenas para admins ou próprio usuário
CREATE POLICY "Allow select own feedback"
ON analytics.meditation_feedback
FOR SELECT
USING (
  auth.uid() = user_id
  OR
  auth.jwt()->>'role' = 'admin'
  OR
  auth.role() = 'service_role'
);

-- Política: Não permitir UPDATE (feedbacks são imutáveis)
-- (Não criar política de UPDATE = ninguém pode atualizar)

-- Política: Não permitir DELETE (feedbacks são permanentes)
-- (Não criar política de DELETE = ninguém pode deletar)

-- Comentários nas colunas para documentação
COMMENT ON TABLE analytics.meditation_feedback IS 'Stores user feedback for meditation sessions with detailed metrics and context';
COMMENT ON COLUMN analytics.meditation_feedback.vote IS 'User satisfaction: positive or negative';
COMMENT ON COLUMN analytics.meditation_feedback.reasons IS 'Reasons for negative feedback (array of: too_long, hard_to_focus, voice_music, other)';
COMMENT ON COLUMN analytics.meditation_feedback.completion_percentage IS 'Percentage of meditation completed (0-100)';
COMMENT ON COLUMN analytics.meditation_feedback.user_id IS 'Authenticated user ID (NULL for guests)';
COMMENT ON COLUMN analytics.meditation_feedback.guest_id IS 'Guest session ID (NULL for authenticated users)';
