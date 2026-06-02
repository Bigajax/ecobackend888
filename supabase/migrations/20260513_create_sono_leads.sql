-- Garante que a funcao updated_at exista (idempotente)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela de leads da landing do Protocolo Sono
CREATE TABLE IF NOT EXISTS public.sono_leads (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT        NOT NULL UNIQUE,
  source             TEXT        DEFAULT 'sono_landing_hero',
  landing_path       TEXT,
  referrer           TEXT,
  utm_source         TEXT,
  utm_medium         TEXT,
  utm_campaign       TEXT,
  utm_term           TEXT,
  utm_content        TEXT,
  ip                 TEXT,
  user_agent         TEXT,
  status             TEXT        NOT NULL DEFAULT 'new'
                                 CHECK (status IN (
                                   'new',
                                   'noite1_sent',
                                   'noite1_listened',
                                   'converted',
                                   'unsubscribed',
                                   'bounced'
                                 )),
  noite1_sent_at     TIMESTAMPTZ,
  noite1_listened_at TIMESTAMPTZ,
  converted_at       TIMESTAMPTZ,
  unsubscribed_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_sono_leads_updated_at ON public.sono_leads;
CREATE TRIGGER update_sono_leads_updated_at
  BEFORE UPDATE ON public.sono_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indices
CREATE INDEX IF NOT EXISTS idx_sono_leads_status       ON public.sono_leads(status);
CREATE INDEX IF NOT EXISTS idx_sono_leads_utm_campaign ON public.sono_leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sono_leads_utm_source   ON public.sono_leads(utm_source)   WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sono_leads_created_at   ON public.sono_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sono_leads_converted    ON public.sono_leads(converted_at) WHERE converted_at IS NOT NULL;

-- RLS: somente service_role tem acesso
ALTER TABLE public.sono_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sono_leads_service_role_all" ON public.sono_leads;
CREATE POLICY "sono_leads_service_role_all" ON public.sono_leads
  FOR ALL USING (auth.role() = 'service_role');
