-- Criação da tabela user_feedback para sistema de feedback de usuários
-- Data: 2026-01-20
-- Versão: 1.0

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_id UUID,
  session_id UUID,
  message TEXT NOT NULL CHECK (char_length(message) <= 1000),
  category VARCHAR(20) CHECK (category IN ('bug', 'feature', 'improvement', 'other')),
  page VARCHAR(255),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários na tabela
COMMENT ON TABLE user_feedback IS 'Armazena feedback de usuários (autenticados ou guests) sobre o aplicativo';
COMMENT ON COLUMN user_feedback.user_id IS 'ID do usuário autenticado (nullable para guests)';
COMMENT ON COLUMN user_feedback.guest_id IS 'ID do guest não autenticado';
COMMENT ON COLUMN user_feedback.session_id IS 'ID da sessão do usuário';
COMMENT ON COLUMN user_feedback.message IS 'Mensagem do feedback (máx 1000 caracteres)';
COMMENT ON COLUMN user_feedback.category IS 'Categoria do feedback: bug, feature, improvement, other';
COMMENT ON COLUMN user_feedback.page IS 'Página onde o feedback foi enviado';
COMMENT ON COLUMN user_feedback.user_agent IS 'User agent do navegador';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_guest_id ON user_feedback(guest_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_category ON user_feedback(category);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_feedback_updated_at
BEFORE UPDATE ON user_feedback
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Habilitar Row Level Security (RLS)
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Usuários autenticados podem inserir feedback
CREATE POLICY "Usuários autenticados podem inserir feedback"
ON user_feedback FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Guests podem inserir feedback
CREATE POLICY "Guests podem inserir feedback"
ON user_feedback FOR INSERT
TO anon
WITH CHECK (guest_id IS NOT NULL);

-- RLS Policy: Usuários podem ver seu próprio feedback
CREATE POLICY "Usuários podem ver seu próprio feedback"
ON user_feedback FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policy: Service role pode ver e modificar tudo (para administração)
CREATE POLICY "Service role tem acesso total"
ON user_feedback
TO service_role
USING (true)
WITH CHECK (true);
