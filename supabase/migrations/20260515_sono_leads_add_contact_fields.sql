-- Adiciona campos de contato e consentimento de marketing em sono_leads.
-- Reforco da captacao: nome, celular e opt-in explicito de marketing (LGPD).

ALTER TABLE public.sono_leads
  ADD COLUMN IF NOT EXISTS name                 TEXT,
  ADD COLUMN IF NOT EXISTS phone                TEXT,
  ADD COLUMN IF NOT EXISTS phone_e164           TEXT,
  ADD COLUMN IF NOT EXISTS marketing_consent    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_consent_ip TEXT;

-- Indice para listar contatos opt-in (remarketing)
CREATE INDEX IF NOT EXISTS idx_sono_leads_marketing_consent
  ON public.sono_leads(marketing_consent)
  WHERE marketing_consent = TRUE;

-- Indice para deduplicacao por celular (mesmo lead em e-mails diferentes)
CREATE INDEX IF NOT EXISTS idx_sono_leads_phone_e164
  ON public.sono_leads(phone_e164)
  WHERE phone_e164 IS NOT NULL;
