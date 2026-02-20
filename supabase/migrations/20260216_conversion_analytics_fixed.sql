-- Migration: Add Conversion Analytics (FIXED VERSION)
-- Date: 2026-02-16
-- Description: Creates complete analytics schema - works even if base tables don't exist

-- ============================================================================
-- STEP 0: Create base usuarios table if it doesn't exist
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Subscription fields
  plan_type TEXT CHECK (plan_type IN ('monthly', 'annual')),
  subscription_status TEXT DEFAULT 'pending' CHECK (subscription_status IN ('active', 'cancelled', 'expired', 'pending')),
  tier TEXT DEFAULT 'premium' CHECK (tier IN ('essentials', 'premium', 'vip')),

  -- Trial fields
  trial_start_date TIMESTAMPTZ,
  trial_end_date TIMESTAMPTZ,

  -- Access control
  access_until TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Provider IDs
  provider_preapproval_id TEXT,
  provider_payment_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table exists but columns don't
DO $$
BEGIN
  -- Add subscription_status if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE public.usuarios ADD COLUMN subscription_status TEXT DEFAULT 'pending' CHECK (subscription_status IN ('active', 'cancelled', 'expired', 'pending'));
  END IF;

  -- Add tier if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.usuarios ADD COLUMN tier TEXT DEFAULT 'premium' CHECK (tier IN ('essentials', 'premium', 'vip'));
  END IF;

  -- Add plan_type if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE public.usuarios ADD COLUMN plan_type TEXT CHECK (plan_type IN ('monthly', 'annual'));
  END IF;

  -- Add access_until if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'access_until'
  ) THEN
    ALTER TABLE public.usuarios ADD COLUMN access_until TIMESTAMPTZ;
  END IF;

  -- Add trial_start_date if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'trial_start_date'
  ) THEN
    ALTER TABLE public.usuarios ADD COLUMN trial_start_date TIMESTAMPTZ;
  END IF;

  -- Add trial_end_date if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'trial_end_date'
  ) THEN
    ALTER TABLE public.usuarios ADD COLUMN trial_end_date TIMESTAMPTZ;
  END IF;

  RAISE NOTICE 'Columns verified/added successfully';
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_usuarios_subscription_status ON public.usuarios(subscription_status);
CREATE INDEX IF NOT EXISTS idx_usuarios_tier ON public.usuarios(tier);
CREATE INDEX IF NOT EXISTS idx_usuarios_access_until ON public.usuarios(access_until);

-- RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_own" ON public.usuarios;
CREATE POLICY "usuarios_select_own" ON public.usuarios
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "usuarios_service_role_all" ON public.usuarios;
CREATE POLICY "usuarios_service_role_all" ON public.usuarios
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 1: Create subscription_events if doesn't exist
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  plan TEXT,
  provider_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON public.subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON public.subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON public.subscription_events(created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_events_select_own" ON public.subscription_events;
CREATE POLICY "subscription_events_select_own" ON public.subscription_events
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscription_events_service_role_all" ON public.subscription_events;
CREATE POLICY "subscription_events_service_role_all" ON public.subscription_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 2: Create conversion_triggers table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversion_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  context JSONB,
  converted BOOLEAN DEFAULT false,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversion_triggers_user_id ON public.conversion_triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_conversion_triggers_type ON public.conversion_triggers(trigger_type);
CREATE INDEX IF NOT EXISTS idx_conversion_triggers_converted ON public.conversion_triggers(converted);
CREATE INDEX IF NOT EXISTS idx_conversion_triggers_created_at ON public.conversion_triggers(created_at DESC);

ALTER TABLE public.conversion_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversion_triggers_select_own" ON public.conversion_triggers;
CREATE POLICY "conversion_triggers_select_own" ON public.conversion_triggers
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversion_triggers_insert_own" ON public.conversion_triggers;
CREATE POLICY "conversion_triggers_insert_own" ON public.conversion_triggers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversion_triggers_service_role_all" ON public.conversion_triggers;
CREATE POLICY "conversion_triggers_service_role_all" ON public.conversion_triggers
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 3: Create analytics views
-- ============================================================================
-- IMPORTANTE: Views só são criadas APÓS garantir que todas as colunas existem

-- View: User distribution
CREATE OR REPLACE VIEW public.user_distribution AS
SELECT
  COALESCE(u.tier, 'free') as tier,
  COALESCE(u.subscription_status, 'free') as subscription_status,
  COUNT(*) as count
FROM auth.users au
LEFT JOIN public.usuarios u ON au.id = u.id
GROUP BY u.tier, u.subscription_status;

-- View: Conversion stats
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

-- View: Conversion funnel
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
  ROUND(
    ((SELECT count FROM trial_users)::numeric / NULLIF((SELECT count FROM total_users), 0) * 100),
    2
  ) as signup_to_trial_rate,
  ROUND(
    ((SELECT count FROM paid_users)::numeric / NULLIF((SELECT count FROM trial_users), 0) * 100),
    2
  ) as trial_to_paid_rate;

-- Grant permissions
GRANT SELECT ON public.user_distribution TO authenticated, service_role;
GRANT SELECT ON public.conversion_stats TO authenticated, service_role;
GRANT SELECT ON public.conversion_funnel TO authenticated, service_role;

-- ============================================================================
-- STEP 4: Helper functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_churn_rate()
RETURNS NUMERIC AS $$
DECLARE
  total_active INTEGER;
  cancellations INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_active
  FROM public.usuarios
  WHERE subscription_status = 'active'
    AND access_until > NOW();

  SELECT COUNT(*) INTO cancellations
  FROM public.subscription_events
  WHERE event_type = 'subscription_cancelled'
    AND created_at >= NOW() - INTERVAL '30 days';

  IF total_active > 0 THEN
    RETURN ROUND((cancellations::numeric / total_active * 100), 2);
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 5: Create test data
-- ============================================================================

-- Sync all auth.users to usuarios table (if not exists)
DO $$
BEGIN
  -- Try to insert only id (safest approach)
  INSERT INTO public.usuarios (id)
  SELECT id FROM auth.users
  ON CONFLICT (id) DO NOTHING;

  -- Update default values for columns that exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'subscription_status') THEN
    UPDATE public.usuarios SET subscription_status = 'pending' WHERE subscription_status IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'tier') THEN
    UPDATE public.usuarios SET tier = 'premium' WHERE tier IS NULL;
  END IF;

  RAISE NOTICE 'User sync completed';
END $$;

-- Create some example paid users (if there are enough users)
DO $$
DECLARE
  user_count INTEGER;
  has_subscription_status BOOLEAN;
  has_tier BOOLEAN;
  has_plan_type BOOLEAN;
  has_access_until BOOLEAN;
  has_trial_dates BOOLEAN;
BEGIN
  -- Check which columns exist
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'subscription_status') INTO has_subscription_status;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'tier') INTO has_tier;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'plan_type') INTO has_plan_type;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'access_until') INTO has_access_until;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'trial_start_date') INTO has_trial_dates;

  -- Only create example users if all required columns exist
  IF has_subscription_status AND has_tier AND has_plan_type AND has_access_until THEN
    SELECT COUNT(*) INTO user_count FROM auth.users;

    IF user_count >= 5 THEN
      -- Make 2 users premium
      WITH sample_users AS (
        SELECT id FROM auth.users LIMIT 5
      )
      UPDATE public.usuarios
      SET
        subscription_status = 'active',
        tier = 'premium',
        plan_type = 'monthly',
        access_until = NOW() + INTERVAL '30 days'
      WHERE id IN (SELECT id FROM sample_users OFFSET 0 LIMIT 2);

      -- Make 1 user essentials
      WITH sample_users AS (
        SELECT id FROM auth.users LIMIT 5
      )
      UPDATE public.usuarios
      SET
        subscription_status = 'active',
        tier = 'essentials',
        plan_type = 'monthly',
        access_until = NOW() + INTERVAL '30 days'
      WHERE id IN (SELECT id FROM sample_users OFFSET 2 LIMIT 1);

      -- Make 1 user trial (if trial columns exist)
      IF has_trial_dates THEN
        WITH sample_users AS (
          SELECT id FROM auth.users LIMIT 5
        )
        UPDATE public.usuarios
        SET
          subscription_status = 'pending',
          tier = 'premium',
          trial_start_date = NOW() - INTERVAL '3 days',
          trial_end_date = NOW() + INTERVAL '4 days'
        WHERE id IN (SELECT id FROM sample_users OFFSET 3 LIMIT 1);
      END IF;

      RAISE NOTICE 'Created example users: 2 premium, 1 essentials, 1 trial';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping example users creation - required columns missing';
  END IF;
END $$;

-- Insert example conversion triggers
INSERT INTO public.conversion_triggers (user_id, trigger_type, converted, created_at)
SELECT
  au.id,
  (ARRAY['chat_daily_limit', 'meditation_premium_locked', 'reflection_archive_locked', 'rings_weekly_limit'])[floor(random() * 4 + 1)],
  (random() < 0.2),
  NOW() - (random() * INTERVAL '30 days')
FROM auth.users au
LIMIT 20
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 6: Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE '📊 Total users: %', (SELECT COUNT(*) FROM auth.users);
  RAISE NOTICE '💎 Premium users: %', (SELECT COUNT(*) FROM public.usuarios WHERE tier = 'premium' AND subscription_status = 'active');
  RAISE NOTICE '🎯 Essentials users: %', (SELECT COUNT(*) FROM public.usuarios WHERE tier = 'essentials' AND subscription_status = 'active');
  RAISE NOTICE '🔔 Triggers created: %', (SELECT COUNT(*) FROM public.conversion_triggers);
END $$;
