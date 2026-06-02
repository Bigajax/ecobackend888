-- Migration: Add Conversion Analytics Tables
-- Date: 2026-02-16
-- Description: Extends existing subscription schema with conversion tracking and analytics

-- ============================================================================
-- STEP 1: Extend public.usuarios table with tier information
-- ============================================================================

-- Adicionar coluna para diferenciar tiers (essentials vs premium)
ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'premium'
  CHECK (tier IN ('essentials', 'premium', 'vip'));

-- Índice para tier
CREATE INDEX IF NOT EXISTS idx_usuarios_tier ON public.usuarios(tier);

-- Comentário
COMMENT ON COLUMN public.usuarios.tier IS 'Subscription tier: essentials (R$ 14.90), premium (R$ 29.90), or vip';

-- ============================================================================
-- STEP 2: Create conversion_triggers table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversion_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'chat_daily_limit',
    'chat_soft_limit',
    'chat_essentials_limit',
    'meditation_premium_locked',
    'meditation_library_banner',
    'meditation_library_footer',
    'reflection_archive_locked',
    'reflection_teaser',
    'rings_weekly_limit',
    'rings_gate',
    'memory_advanced',
    'memory_unlimited',
    'voice_daily_limit',
    'voice_essentials_limit',
    'generic'
  )),

  context JSONB, -- Dados extras: feature_id, meditation_id, current_count, etc.
  converted BOOLEAN DEFAULT false, -- Se resultou em conversão (subscription)
  converted_at TIMESTAMPTZ, -- Quando converteu

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_conversion_triggers_user_id ON public.conversion_triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_conversion_triggers_type ON public.conversion_triggers(trigger_type);
CREATE INDEX IF NOT EXISTS idx_conversion_triggers_converted ON public.conversion_triggers(converted);
CREATE INDEX IF NOT EXISTS idx_conversion_triggers_created_at ON public.conversion_triggers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_triggers_user_created ON public.conversion_triggers(user_id, created_at DESC);

-- RLS Policies
ALTER TABLE public.conversion_triggers ENABLE ROW LEVEL SECURITY;

-- Users can view their own triggers
CREATE POLICY "conversion_triggers_select_own" ON public.conversion_triggers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own triggers
CREATE POLICY "conversion_triggers_insert_own" ON public.conversion_triggers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "conversion_triggers_service_role_all" ON public.conversion_triggers
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 3: Create views for analytics dashboard
-- ============================================================================

-- View: User distribution by tier and status
CREATE OR REPLACE VIEW public.user_distribution AS
SELECT
  COALESCE(tier, 'free') as tier,
  subscription_status,
  COUNT(*) as count
FROM public.usuarios
GROUP BY tier, subscription_status

UNION ALL

-- Incluir usuários free (que não estão em usuarios)
SELECT
  'free' as tier,
  'free' as subscription_status,
  COUNT(*) as count
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.usuarios u WHERE u.id = au.id
);

-- View: Conversion trigger statistics (últimos 30 dias)
CREATE OR REPLACE VIEW public.conversion_stats AS
SELECT
  ct.trigger_type,
  COUNT(*) as total_hits,
  COUNT(*) FILTER (WHERE ct.converted = true) as conversions,
  ROUND(
    (COUNT(*) FILTER (WHERE ct.converted = true)::numeric / NULLIF(COUNT(*), 0) * 100),
    2
  ) as conversion_rate
FROM public.conversion_triggers ct
WHERE ct.created_at >= NOW() - INTERVAL '30 days'
GROUP BY ct.trigger_type
ORDER BY conversion_rate DESC;

-- View: Conversion funnel metrics
CREATE OR REPLACE VIEW public.conversion_funnel AS
WITH
  total_users AS (
    SELECT COUNT(*) as count FROM auth.users
  ),
  trial_users AS (
    SELECT COUNT(*) as count
    FROM public.usuarios
    WHERE trial_start_date IS NOT NULL
  ),
  paid_users AS (
    SELECT COUNT(*) as count
    FROM public.usuarios
    WHERE subscription_status = 'active'
      AND access_until > NOW()
  )
SELECT
  (SELECT count FROM total_users) as total_signups,
  (SELECT count FROM trial_users) as trials_started,
  (SELECT count FROM paid_users) as paid_conversions,

  -- Conversion rates
  ROUND(
    ((SELECT count FROM trial_users)::numeric / NULLIF((SELECT count FROM total_users), 0) * 100),
    2
  ) as signup_to_trial_rate,

  ROUND(
    ((SELECT count FROM paid_users)::numeric / NULLIF((SELECT count FROM trial_users), 0) * 100),
    2
  ) as trial_to_paid_rate;

-- ============================================================================
-- STEP 4: Grant permissions to views
-- ============================================================================

GRANT SELECT ON public.user_distribution TO authenticated;
GRANT SELECT ON public.conversion_stats TO authenticated;
GRANT SELECT ON public.conversion_funnel TO authenticated;

GRANT SELECT ON public.user_distribution TO service_role;
GRANT SELECT ON public.conversion_stats TO service_role;
GRANT SELECT ON public.conversion_funnel TO service_role;

-- ============================================================================
-- STEP 5: Helper functions
-- ============================================================================

-- Function: Get churn rate (últimos 30 dias)
CREATE OR REPLACE FUNCTION public.get_churn_rate()
RETURNS NUMERIC AS $$
DECLARE
  total_active INTEGER;
  cancellations INTEGER;
BEGIN
  -- Total de usuários ativos no início do período
  SELECT COUNT(*) INTO total_active
  FROM public.usuarios
  WHERE subscription_status = 'active'
    AND access_until > NOW();

  -- Cancelamentos nos últimos 30 dias
  SELECT COUNT(*) INTO cancellations
  FROM public.subscription_events
  WHERE event_type = 'subscription_cancelled'
    AND created_at >= NOW() - INTERVAL '30 days';

  -- Calcular churn rate
  IF total_active > 0 THEN
    RETURN ROUND((cancellations::numeric / total_active * 100), 2);
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Mark trigger as converted
CREATE OR REPLACE FUNCTION public.mark_trigger_converted(
  p_trigger_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.conversion_triggers
  SET
    converted = true,
    converted_at = NOW()
  WHERE id = p_trigger_id
    AND user_id = p_user_id
    AND converted = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 6: Insert example data for testing (opcional - comentar se não quiser)
-- ============================================================================

-- Inserir dados de teste apenas se não houver conversion_triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversion_triggers LIMIT 1) THEN
    -- Inserir triggers de exemplo para usuários existentes
    INSERT INTO public.conversion_triggers (user_id, trigger_type, converted, created_at)
    SELECT
      au.id,
      (ARRAY['chat_daily_limit', 'meditation_premium_locked', 'reflection_archive_locked'])[floor(random() * 3 + 1)],
      (random() < 0.2), -- 20% converteram
      NOW() - (random() * INTERVAL '30 days')
    FROM auth.users au
    LIMIT 20;

    RAISE NOTICE 'Inserted example conversion triggers';
  END IF;
END $$;

-- ============================================================================
-- STEP 7: Comments and documentation
-- ============================================================================

COMMENT ON TABLE public.conversion_triggers IS 'Tracks when users hit free-tier limits or premium gates';
COMMENT ON COLUMN public.conversion_triggers.trigger_type IS 'Type of limit/gate that triggered conversion prompt';
COMMENT ON COLUMN public.conversion_triggers.context IS 'Additional data: feature_id, current_count, limit_value, etc.';
COMMENT ON COLUMN public.conversion_triggers.converted IS 'Whether this trigger resulted in a paid conversion';
COMMENT ON COLUMN public.conversion_triggers.converted_at IS 'Timestamp when user converted after this trigger';

COMMENT ON VIEW public.user_distribution IS 'Distribution of users by tier and subscription status';
COMMENT ON VIEW public.conversion_stats IS 'Conversion statistics by trigger type (last 30 days)';
COMMENT ON VIEW public.conversion_funnel IS 'Overall conversion funnel metrics';

COMMENT ON FUNCTION public.get_churn_rate() IS 'Calculate churn rate for the last 30 days';
COMMENT ON FUNCTION public.mark_trigger_converted(UUID, UUID) IS 'Mark a conversion trigger as converted when user upgrades';

-- ============================================================================
-- STEP 8: Verificação final
-- ============================================================================

-- Verificar se tudo foi criado corretamente
DO $$
BEGIN
  -- Verificar tabela
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversion_triggers') THEN
    RAISE NOTICE '✅ Table conversion_triggers created successfully';
  END IF;

  -- Verificar views
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'conversion_stats') THEN
    RAISE NOTICE '✅ View conversion_stats created successfully';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'user_distribution') THEN
    RAISE NOTICE '✅ View user_distribution created successfully';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'conversion_funnel') THEN
    RAISE NOTICE '✅ View conversion_funnel created successfully';
  END IF;

  RAISE NOTICE '✅ Migration completed successfully!';
END $$;
