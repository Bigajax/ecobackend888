-- Migration: adiciona coluna `unlocked` em sono_guest_flow_events
-- Date: 2026-06-18
-- Motivo: o frontend (SonoInlineCheckout) grava `upsertEvent({ unlocked: true })`
-- ao desbloquear/converter, mas a coluna não existe — o upsert falhava em
-- silêncio (try/catch). Esta coluna fecha a sequência do funil guest do sono
-- (reflexão → oferta → cta → desbloqueio). Idempotente (IF NOT EXISTS).

ALTER TABLE public.sono_guest_flow_events
  ADD COLUMN IF NOT EXISTS unlocked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.sono_guest_flow_events.unlocked
  IS 'TRUE quando o guest desbloqueou/assinou (converteu) no fluxo do sono';

CREATE INDEX IF NOT EXISTS idx_sono_guest_flow_unlocked
  ON public.sono_guest_flow_events(unlocked);

-- CAUSA RAIZ da tabela vazia: a migration original criou as POLICIES de RLS pro
-- `anon`, mas faltou o GRANT de tabela. Sem isso, todo upsert do frontend (que
-- roda como `anon`) leva "permission denied" e falha em silencio. So INSERT+UPDATE
-- (o upsert usa return=minimal; leitura continua restrita ao service_role/RLS).
GRANT INSERT, UPDATE ON public.sono_guest_flow_events TO anon;
