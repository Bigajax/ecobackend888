-- ============================================================================
-- Migration: Mover meditation_feedback de public para analytics schema
-- Data: 2025-12-19
-- Descrição: Move a tabela existente e seus dados para o schema analytics
-- ============================================================================

-- PASSO 1: Backup dos dados existentes (se houver)
-- Cria tabela temporária com os dados atuais
CREATE TEMP TABLE temp_meditation_feedback_backup AS
SELECT * FROM public.meditation_feedback;

-- Verificar quantos registros foram copiados
DO $$
DECLARE
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM temp_meditation_feedback_backup;
  RAISE NOTICE 'Backup criado com % registros', backup_count;
END $$;

-- PASSO 2: Dropar a tabela antiga do schema public
DROP TABLE IF EXISTS public.meditation_feedback CASCADE;

-- PASSO 3: Criar tabela no schema analytics
CREATE TABLE IF NOT EXISTS analytics.meditation_feedback (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Feedback principal
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('positive', 'negative')),
  reasons TEXT[],

  -- Contexto da meditação
  meditation_id VARCHAR(100) NOT NULL,
  meditation_title VARCHAR(255) NOT NULL,
  meditation_duration_seconds INTEGER NOT NULL,
  meditation_category VARCHAR(50) NOT NULL,

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
  user_id UUID,
  session_id VARCHAR(100) NOT NULL,
  guest_id VARCHAR(100),

  -- Metadados
  feedback_source VARCHAR(50) DEFAULT 'meditation_completion',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint
  CONSTRAINT valid_user CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

-- PASSO 4: Restaurar dados do backup
INSERT INTO analytics.meditation_feedback
SELECT * FROM temp_meditation_feedback_backup;

-- Verificar quantos registros foram restaurados
DO $$
DECLARE
  restored_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO restored_count FROM analytics.meditation_feedback;
  RAISE NOTICE 'Dados restaurados: % registros em analytics.meditation_feedback', restored_count;
END $$;

-- PASSO 5: Criar índices para performance
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

-- PASSO 6: Criar função para atualizar updated_at (se não existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- PASSO 7: Criar trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_meditation_feedback_updated_at ON analytics.meditation_feedback;
CREATE TRIGGER update_meditation_feedback_updated_at
  BEFORE UPDATE ON analytics.meditation_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- PASSO 8: Grant permissions to service role
GRANT SELECT, INSERT, UPDATE, DELETE ON analytics.meditation_feedback TO service_role;

-- PASSO 9: Habilitar RLS
ALTER TABLE analytics.meditation_feedback ENABLE ROW LEVEL SECURITY;

-- PASSO 10: Criar políticas RLS

-- Política: Permitir INSERT para usuários autenticados e guests
DROP POLICY IF EXISTS "Allow insert meditation feedback" ON analytics.meditation_feedback;
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
DROP POLICY IF EXISTS "Allow select own feedback" ON analytics.meditation_feedback;
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

-- PASSO 11: Adicionar comentários nas colunas
COMMENT ON TABLE analytics.meditation_feedback IS 'Stores user feedback for meditation sessions with detailed metrics and context';
COMMENT ON COLUMN analytics.meditation_feedback.vote IS 'User satisfaction: positive or negative';
COMMENT ON COLUMN analytics.meditation_feedback.reasons IS 'Reasons for negative feedback (array of: too_long, hard_to_focus, voice_music, other)';
COMMENT ON COLUMN analytics.meditation_feedback.completion_percentage IS 'Percentage of meditation completed (0-100)';
COMMENT ON COLUMN analytics.meditation_feedback.user_id IS 'Authenticated user ID (NULL for guests)';
COMMENT ON COLUMN analytics.meditation_feedback.guest_id IS 'Guest session ID (NULL for authenticated users)';

-- PASSO 12: Verificação final
DO $$
DECLARE
  table_exists BOOLEAN;
  final_count INTEGER;
BEGIN
  -- Verificar se a tabela existe no schema analytics
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'analytics'
    AND table_name = 'meditation_feedback'
  ) INTO table_exists;

  IF table_exists THEN
    SELECT COUNT(*) INTO final_count FROM analytics.meditation_feedback;
    RAISE NOTICE '✅ SUCESSO! Tabela analytics.meditation_feedback criada com % registros', final_count;
  ELSE
    RAISE EXCEPTION '❌ ERRO! Tabela não foi criada no schema analytics';
  END IF;
END $$;

-- PASSO 13: Limpar tabela temporária
DROP TABLE IF EXISTS temp_meditation_feedback_backup;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
