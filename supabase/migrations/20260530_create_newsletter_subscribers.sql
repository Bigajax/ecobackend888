-- Garante que a funcao updated_at exista (idempotente)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela de inscritos da newsletter geral (footer "Fique por dentro")
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL UNIQUE,
  source          TEXT        DEFAULT 'newsletter_footer',
  landing_path    TEXT,
  referrer        TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  ip              TEXT,
  user_agent      TEXT,
  status          TEXT        NOT NULL DEFAULT 'subscribed'
                              CHECK (status IN (
                                'subscribed',
                                'unsubscribed',
                                'bounced'
                              )),
  unsubscribed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_newsletter_subscribers_updated_at ON public.newsletter_subscribers;
CREATE TRIGGER update_newsletter_subscribers_updated_at
  BEFORE UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indices
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status       ON public.newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_source       ON public.newsletter_subscribers(source)       WHERE source       IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_utm_campaign ON public.newsletter_subscribers(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_utm_source   ON public.newsletter_subscribers(utm_source)   WHERE utm_source   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at   ON public.newsletter_subscribers(created_at DESC);

-- RLS: somente service_role tem acesso
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_subscribers_service_role_all" ON public.newsletter_subscribers;
CREATE POLICY "newsletter_subscribers_service_role_all" ON public.newsletter_subscribers
  FOR ALL USING (auth.role() = 'service_role');
