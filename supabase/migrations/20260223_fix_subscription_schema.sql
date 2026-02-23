-- Migration: Fix subscription schema gaps
-- Date: 2026-02-23
-- Estado atual do banco:
--   usuarios          → EXISTS (mas colunas faltando)
--   subscription_events → EXISTS (mas constraints erradas)
--   payments          → NÃO EXISTE → criar
--   webhook_logs      → NÃO EXISTE → criar

-- ============================================================================
-- 1. ADICIONAR COLUNAS FALTANDO em public.usuarios
-- ============================================================================

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS access_until            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_start_date        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end_date          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id     TEXT;

-- Corrigir plan_type CHECK (adicionar 'essentials')
ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_plan_type_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_plan_type_check
  CHECK (plan_type IN ('monthly', 'annual', 'essentials'));

-- Indexes para novas colunas
CREATE INDEX IF NOT EXISTS idx_usuarios_access_until
  ON public.usuarios(access_until);

CREATE INDEX IF NOT EXISTS idx_usuarios_provider_preapproval_id
  ON public.usuarios(provider_preapproval_id)
  WHERE provider_preapproval_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_provider_payment_id
  ON public.usuarios(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- ============================================================================
-- 2. CORRIGIR subscription_events (constraints erradas)
-- ============================================================================

-- Corrigir event_type CHECK (adicionar tipos usados no código)
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

-- Corrigir plan CHECK (adicionar 'essentials')
ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_plan_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_plan_check
  CHECK (plan IN ('monthly', 'annual', 'essentials'));

-- ============================================================================
-- 3. CRIAR public.payments (não existe)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  provider_payment_id TEXT        NOT NULL UNIQUE,
  status              TEXT        NOT NULL CHECK (status IN ('approved', 'pending', 'rejected', 'refunded', 'cancelled')),
  amount              DECIMAL(10,2) NOT NULL,
  plan                TEXT        NOT NULL CHECK (plan IN ('monthly', 'annual', 'essentials')),
  payment_method      TEXT,
  receipt_url         TEXT,
  raw_payload         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_user_id
  ON public.payments(user_id);

CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id
  ON public.payments(provider_payment_id);

CREATE INDEX IF NOT EXISTS idx_payments_created_at_desc
  ON public.payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON public.payments(status);

-- RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "payments_service_role_all" ON public.payments
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 4. CRIAR public.webhook_logs (não existe)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT        NOT NULL DEFAULT 'mercadopago',
  event_type   TEXT        NOT NULL,
  event_id     TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  processed    BOOLEAN     NOT NULL DEFAULT false,
  error_message TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  CONSTRAINT webhook_logs_unique_event UNIQUE (source, event_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id
  ON public.webhook_logs(event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed
  ON public.webhook_logs(processed);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at_desc
  ON public.webhook_logs(received_at DESC);

-- RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_logs_service_role_all" ON public.webhook_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 5. TRIGGER updated_at (se não existir)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_usuarios_updated_at ON public.usuarios;
CREATE TRIGGER update_usuarios_updated_at
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN public.usuarios.access_until            IS 'Date until user has premium access (regardless of status)';
COMMENT ON COLUMN public.usuarios.current_period_end      IS 'End of current billing period';
COMMENT ON COLUMN public.usuarios.trial_start_date        IS 'Start date of 7-day free trial';
COMMENT ON COLUMN public.usuarios.trial_end_date          IS 'End date of 7-day free trial';
COMMENT ON COLUMN public.usuarios.provider_preapproval_id IS 'Mercado Pago preapproval ID for recurring subscriptions';
COMMENT ON COLUMN public.usuarios.provider_payment_id     IS 'Mercado Pago payment ID for annual subscriptions';
COMMENT ON TABLE  public.payments                         IS 'Payment transaction history';
COMMENT ON TABLE  public.webhook_logs                     IS 'Webhook event logs for idempotency and debugging';
