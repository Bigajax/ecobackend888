-- Migration: Fix subscription schema gaps
-- Date: 2026-02-23
-- Description:
--   1. Adds missing columns to public.usuarios (current_period_end, access_until, etc.)
--   2. Expands CHECK constraints to include 'essentials' plan type
--   3. Adds missing event types to subscription_events
--   All statements use IF NOT EXISTS / DROP CONSTRAINT + ADD CONSTRAINT pattern
--   so this is safe to re-run.

-- ============================================================================
-- 1. ADD MISSING COLUMNS TO usuarios
-- ============================================================================

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS access_until            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_start_date        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end_date          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id     TEXT;

-- ============================================================================
-- 2. FIX plan_type CHECK on usuarios (add 'essentials')
-- ============================================================================

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_plan_type_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_plan_type_check
  CHECK (plan_type IN ('monthly', 'annual', 'essentials'));

-- ============================================================================
-- 3. FIX plan CHECK on payments (add 'essentials')
-- ============================================================================

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_plan_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_plan_check
  CHECK (plan IN ('monthly', 'annual', 'essentials'));

-- ============================================================================
-- 4. FIX event_type CHECK on subscription_events (add missing types)
-- ============================================================================

ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check
  CHECK (event_type IN (
    'checkout_initiated',
    'trial_started',
    'subscription_renewed',
    'payment_approved',
    'payment_failed',
    'payment_rejected',
    'payment_pending',
    'subscription_cancelled',
    'subscription_cancelled_by_provider',
    'subscription_reactivated',
    'subscription_expired',
    'subscription_authorized'
  ));

-- ============================================================================
-- 5. FIX plan CHECK on subscription_events (add 'essentials')
-- ============================================================================

ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_plan_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_plan_check
  CHECK (plan IN ('monthly', 'annual', 'essentials'));

-- ============================================================================
-- 6. INDEXES for new columns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_usuarios_access_until
  ON public.usuarios(access_until);

CREATE INDEX IF NOT EXISTS idx_usuarios_provider_preapproval_id
  ON public.usuarios(provider_preapproval_id)
  WHERE provider_preapproval_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_provider_payment_id
  ON public.usuarios(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN public.usuarios.access_until         IS 'Date until user has premium access (regardless of status)';
COMMENT ON COLUMN public.usuarios.current_period_end   IS 'End of current billing period';
COMMENT ON COLUMN public.usuarios.trial_start_date     IS 'Start date of 7-day free trial (monthly/essentials plans)';
COMMENT ON COLUMN public.usuarios.trial_end_date       IS 'End date of 7-day free trial';
COMMENT ON COLUMN public.usuarios.provider_preapproval_id IS 'Mercado Pago preapproval ID for recurring subscriptions';
COMMENT ON COLUMN public.usuarios.provider_payment_id  IS 'Mercado Pago payment ID for annual subscriptions';
