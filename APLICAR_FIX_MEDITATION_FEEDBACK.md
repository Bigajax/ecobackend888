# Fix: Tabela meditation_feedback no Schema Correto

## Problema Identificado

A tabela `meditation_feedback` foi criada no schema `public`, mas o código backend usa `getAnalyticsClient()` que aponta para o schema `analytics`. Isso causava falha silenciosa no insert.

## Solução

A migration foi corrigida para criar a tabela no schema `analytics` com as permissões adequadas.

## Como Aplicar o Fix

### Opção 1: Via Supabase Dashboard (Recomendado)

1. Acesse o Supabase Dashboard do seu projeto
2. Vá em **SQL Editor**
3. Execute o seguinte SQL:

```sql
-- 1. Remover tabela antiga (se existir no schema public)
DROP TABLE IF EXISTS public.meditation_feedback CASCADE;

-- 2. Criar tabela no schema correto (analytics)
-- Copie e execute TODO o conteúdo do arquivo:
-- supabase/migrations/20251219_create_meditation_feedback_table.sql
```

### Opção 2: Via Supabase CLI

Se você tem o Supabase CLI configurado:

```bash
# 1. Aplicar migration de limpeza
supabase db push

# 2. Verificar status
supabase db pull --dry-run
```

### Opção 3: Manual SQL (Rápido)

Execute este SQL no Supabase SQL Editor:

```sql
-- Remover tabela antiga
DROP TABLE IF EXISTS public.meditation_feedback CASCADE;

-- Criar tabela no schema analytics
CREATE TABLE IF NOT EXISTS analytics.meditation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('positive', 'negative')),
  reasons TEXT[],
  meditation_id VARCHAR(100) NOT NULL,
  meditation_title VARCHAR(255) NOT NULL,
  meditation_duration_seconds INTEGER NOT NULL,
  meditation_category VARCHAR(50) NOT NULL,
  actual_play_time_seconds INTEGER NOT NULL,
  completion_percentage DECIMAL(5,2) NOT NULL CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  pause_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  seek_count INTEGER DEFAULT 0,
  background_sound_id VARCHAR(50),
  background_sound_title VARCHAR(100),
  user_id UUID,
  session_id VARCHAR(100) NOT NULL,
  guest_id VARCHAR(100),
  feedback_source VARCHAR(50) DEFAULT 'meditation_completion',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_user CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_meditation_feedback_user_id ON analytics.meditation_feedback(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meditation_feedback_meditation_id ON analytics.meditation_feedback(meditation_id);
CREATE INDEX IF NOT EXISTS idx_meditation_feedback_category ON analytics.meditation_feedback(meditation_category);
CREATE INDEX IF NOT EXISTS idx_meditation_feedback_vote ON analytics.meditation_feedback(vote);
CREATE INDEX IF NOT EXISTS idx_meditation_feedback_created_at ON analytics.meditation_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meditation_feedback_session_id ON analytics.meditation_feedback(session_id);

-- Função de update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS update_meditation_feedback_updated_at ON analytics.meditation_feedback;
CREATE TRIGGER update_meditation_feedback_updated_at
  BEFORE UPDATE ON analytics.meditation_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON analytics.meditation_feedback TO service_role;

-- RLS
ALTER TABLE analytics.meditation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert meditation feedback"
ON analytics.meditation_feedback
FOR INSERT
WITH CHECK (
  (auth.uid() = user_id)
  OR
  (user_id IS NULL AND guest_id IS NOT NULL)
  OR
  (auth.role() = 'service_role')
);

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

-- Comentários
COMMENT ON TABLE analytics.meditation_feedback IS 'Stores user feedback for meditation sessions with detailed metrics and context';
COMMENT ON COLUMN analytics.meditation_feedback.vote IS 'User satisfaction: positive or negative';
COMMENT ON COLUMN analytics.meditation_feedback.reasons IS 'Reasons for negative feedback (array of: too_long, hard_to_focus, voice_music, other)';
COMMENT ON COLUMN analytics.meditation_feedback.completion_percentage IS 'Percentage of meditation completed (0-100)';
COMMENT ON COLUMN analytics.meditation_feedback.user_id IS 'Authenticated user ID (NULL for guests)';
COMMENT ON COLUMN analytics.meditation_feedback.guest_id IS 'Guest session ID (NULL for authenticated users)';
```

## Verificação

Após aplicar, verifique se a tabela foi criada corretamente:

```sql
-- Verificar se a tabela existe no schema analytics
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name = 'meditation_feedback';

-- Deve retornar: analytics | meditation_feedback
```

## Testando

Após aplicar a migration:

1. Reinicie o backend (se estiver rodando)
2. Complete uma meditação no frontend
3. Envie o feedback
4. Verifique no Supabase Dashboard que o registro foi salvo em `analytics.meditation_feedback`

## Arquivos Modificados

- ✅ `supabase/migrations/20251219_create_meditation_feedback_table.sql` - Corrigido para usar schema analytics
- ✅ `supabase/migrations/20251219_fix_meditation_feedback_schema.sql` - Migration de limpeza
- ✅ `server/controllers/meditationFeedbackController.ts` - Já usa getAnalyticsClient() corretamente
