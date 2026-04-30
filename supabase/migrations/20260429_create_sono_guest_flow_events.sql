CREATE TABLE IF NOT EXISTS public.sono_guest_flow_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id            TEXT        NOT NULL UNIQUE,
  source              TEXT        NOT NULL DEFAULT 'direct',
  reflection_answer   TEXT        CHECK (reflection_answer IN ('yes', 'little', 'no')),
  max_step_reached    INT         NOT NULL DEFAULT 1,
  reached_offer       BOOLEAN     NOT NULL DEFAULT FALSE,
  cta_clicked         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sono_guest_flow_created_at    ON public.sono_guest_flow_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sono_guest_flow_reflection    ON public.sono_guest_flow_events(reflection_answer);
CREATE INDEX IF NOT EXISTS idx_sono_guest_flow_reached_offer ON public.sono_guest_flow_events(reached_offer);
CREATE INDEX IF NOT EXISTS idx_sono_guest_flow_cta_clicked   ON public.sono_guest_flow_events(cta_clicked);

CREATE OR REPLACE FUNCTION public.set_sono_guest_flow_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sono_guest_flow_updated_at ON public.sono_guest_flow_events;

CREATE TRIGGER trg_sono_guest_flow_updated_at
  BEFORE UPDATE ON public.sono_guest_flow_events
  FOR EACH ROW EXECUTE FUNCTION public.set_sono_guest_flow_updated_at();

ALTER TABLE public.sono_guest_flow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sono_guest_flow_anon_insert"   ON public.sono_guest_flow_events;
DROP POLICY IF EXISTS "sono_guest_flow_anon_update"   ON public.sono_guest_flow_events;
DROP POLICY IF EXISTS "sono_guest_flow_service_select" ON public.sono_guest_flow_events;

CREATE POLICY "sono_guest_flow_anon_insert"    ON public.sono_guest_flow_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "sono_guest_flow_anon_update"    ON public.sono_guest_flow_events FOR UPDATE TO anon USING (true);
CREATE POLICY "sono_guest_flow_service_select" ON public.sono_guest_flow_events FOR SELECT USING (auth.role() = 'service_role');

COMMENT ON TABLE  public.sono_guest_flow_events                    IS 'Progresso e respostas do fluxo pos-meditacao de guests (protocolo sono 7 noites)';
COMMENT ON COLUMN public.sono_guest_flow_events.guest_id           IS 'eco.sono.guest_id (session) ou eco_guest_id (local)';
COMMENT ON COLUMN public.sono_guest_flow_events.reflection_answer  IS 'Resposta da Noite 1: yes | little | no';
COMMENT ON COLUMN public.sono_guest_flow_events.max_step_reached   IS 'Passo maximo atingido no fluxo (1-6)';
COMMENT ON COLUMN public.sono_guest_flow_events.reached_offer      IS 'TRUE quando o guest chegou ao step 6 (oferta)';
COMMENT ON COLUMN public.sono_guest_flow_events.cta_clicked        IS 'TRUE quando clicou em Quero continuar dormindo assim';
