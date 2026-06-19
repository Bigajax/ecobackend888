-- Campos do gate de cadastro do /sono em sono_leads.
-- O gate captura só e-mail (antes da Noite 1) e atribui o provider/guest.
-- `provider`: 'email' | 'google' (como o lead chegou no gate).
-- `guest_id`: correlaciona com sono_guest_flow_events / telemetria do funil.

ALTER TABLE public.sono_leads
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS guest_id TEXT;

-- 'sono_signup_gate' é uma origem válida de lead (já é TEXT livre em `source`,
-- mas deixamos o índice para segmentar leads do gate no remarketing).
CREATE INDEX IF NOT EXISTS idx_sono_leads_source ON public.sono_leads(source);
