-- Migration: Create Subscription Tables for Mercado Pago Integration
-- Date: 2026-01-22
-- Description: Creates tables for subscription management, payment tracking, events, and webhook logs

-- ============================================================================
-- TABLE: public.usuarios
-- Stores core subscription state linked to auth.users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT CHECK (plan_type IN ('monthly', 'annual')),
  subscription_status TEXT NOT NULL DEFAULT 'pending' CHECK (subscription_status IN ('active', 'cancelled', 'expired', 'pending')),
  trial_start_date TIMESTAMPTZ,
  trial_end_date TIMESTAMPTZ,
  access_until TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  provider_preapproval_id TEXT, -- For monthly recurring subscriptions
  provider_payment_id TEXT,      -- For annual one-time payments
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_subscription_status ON public.usuarios(subscription_status);
CREATE INDEX IF NOT EXISTS idx_usuarios_access_until ON public.usuarios(access_until);
CREATE INDEX IF NOT EXISTS idx_usuarios_provider_preapproval_id ON public.usuarios(provider_preapproval_id) WHERE provider_preapproval_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_provider_payment_id ON public.usuarios(provider_payment_id) WHERE provider_payment_id IS NOT NULL;

-- RLS Policies for usuarios
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription data
CREATE POLICY "usuarios_select_own" ON public.usuarios
  FOR SELECT
  USING (auth.uid() = id);

-- Service role has full access (for webhooks and admin operations)
CREATE POLICY "usuarios_service_role_all" ON public.usuarios
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- TABLE: public.payments
-- Stores payment transaction history
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  provider_payment_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('approved', 'pending', 'rejected', 'refunded', 'cancelled')),
  amount DECIMAL(10, 2) NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'annual')),
  payment_method TEXT,
  receipt_url TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON public.payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at_desc ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- RLS Policies for payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can read their own payment history
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "payments_service_role_all" ON public.payments
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- TABLE: public.subscription_events
-- Audit trail for subscription lifecycle events
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'checkout_initiated',
    'trial_started',
    'subscription_renewed',
    'payment_approved',
    'payment_failed',
    'subscription_cancelled',
    'subscription_reactivated',
    'subscription_expired'
  )),
  plan TEXT CHECK (plan IN ('monthly', 'annual')),
  provider_id TEXT, -- preapproval_id or payment_id from Mercado Pago
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscription_events
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON public.subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON public.subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at_desc ON public.subscription_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_created ON public.subscription_events(user_id, created_at DESC);

-- RLS Policies for subscription_events
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own events
CREATE POLICY "subscription_events_select_own" ON public.subscription_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "subscription_events_service_role_all" ON public.subscription_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- TABLE: public.webhook_logs
-- Webhook debugging, idempotency, and audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'mercadopago',
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  -- Idempotency constraint
  CONSTRAINT webhook_logs_unique_event UNIQUE (source, event_id)
);

-- Indexes for webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id ON public.webhook_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON public.webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at_desc ON public.webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source_event_type ON public.webhook_logs(source, event_type);

-- RLS Policies for webhook_logs
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (webhooks run as service role)
CREATE POLICY "webhook_logs_service_role_all" ON public.webhook_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_usuarios_updated_at
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS: Table documentation
-- ============================================================================
COMMENT ON TABLE public.usuarios IS 'Core subscription state for users with Mercado Pago integration';
COMMENT ON TABLE public.payments IS 'Payment transaction history for subscription purchases';
COMMENT ON TABLE public.subscription_events IS 'Audit trail of subscription lifecycle events';
COMMENT ON TABLE public.webhook_logs IS 'Webhook event logs for debugging and idempotency';

COMMENT ON COLUMN public.usuarios.plan_type IS 'Subscription plan type: monthly (recurring) or annual (one-time)';
COMMENT ON COLUMN public.usuarios.subscription_status IS 'Current subscription status: active, cancelled, expired, or pending';
COMMENT ON COLUMN public.usuarios.trial_start_date IS 'Start date of 7-day free trial (monthly plans only)';
COMMENT ON COLUMN public.usuarios.trial_end_date IS 'End date of 7-day free trial (monthly plans only)';
COMMENT ON COLUMN public.usuarios.access_until IS 'Date until user has premium access (regardless of status)';
COMMENT ON COLUMN public.usuarios.current_period_end IS 'End of current billing period';
COMMENT ON COLUMN public.usuarios.provider_preapproval_id IS 'Mercado Pago preapproval ID for monthly subscriptions';
COMMENT ON COLUMN public.usuarios.provider_payment_id IS 'Mercado Pago payment ID for annual subscriptions';

COMMENT ON COLUMN public.webhook_logs.event_id IS 'Unique event ID from webhook provider (for idempotency)';
COMMENT ON CONSTRAINT webhook_logs_unique_event ON public.webhook_logs IS 'Ensures webhooks are processed exactly once';
