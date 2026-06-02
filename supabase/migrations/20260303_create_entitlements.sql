-- Migration: Create Entitlements Table
-- Date: 2026-03-03
-- Description: Tabela para produtos avulsos (ex: Protocolo Sono Profundo – 7 noites)
--              Desacoplada da tabela usuarios (assinaturas recorrentes).

CREATE TABLE public.entitlements (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable até login
  email              TEXT,                                                        -- do pagador MP
  product_key        TEXT        NOT NULL,                                        -- 'protocolo_sono_7_noites'
  status             TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('active','pending','expired','refunded')),
  payment_id         TEXT        UNIQUE,                                          -- id do pagamento MP
  external_reference TEXT        UNIQUE,                                          -- sono_{ts}_{rand}
  source             TEXT        DEFAULT 'landing',                               -- 'landing' | 'app'
  utm_data           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at (reutiliza função já existente no banco)
CREATE TRIGGER update_entitlements_updated_at
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índices
CREATE INDEX idx_entitlements_user_id        ON public.entitlements(user_id)           WHERE user_id IS NOT NULL;
CREATE INDEX idx_entitlements_email          ON public.entitlements(email)              WHERE email IS NOT NULL;
CREATE INDEX idx_entitlements_product_key    ON public.entitlements(product_key);
CREATE INDEX idx_entitlements_ext_ref        ON public.entitlements(external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX idx_entitlements_status         ON public.entitlements(status);

-- RLS
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- Usuário lê somente seus próprios entitlements
CREATE POLICY "entitlements_select_own" ON public.entitlements
  FOR SELECT USING (auth.uid() = user_id);

-- Service role tem acesso total (backend usa service_role key)
CREATE POLICY "entitlements_service_role_all" ON public.entitlements
  FOR ALL USING (auth.role() = 'service_role');

-- Comentários
COMMENT ON TABLE public.entitlements IS 'Entitlements para produtos avulsos (não-assinatura) como Protocolo Sono';
COMMENT ON COLUMN public.entitlements.user_id IS 'Vinculado ao fazer claim pós-login; null até então';
COMMENT ON COLUMN public.entitlements.external_reference IS 'Referência gerada pelo backend: sono_{ts}_{hex}';
COMMENT ON COLUMN public.entitlements.product_key IS 'Identificador do produto: protocolo_sono_7_noites';
