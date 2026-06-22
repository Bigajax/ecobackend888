-- Migration: Add guest_id to entitlements
-- Date: 2026-06-22
-- Description: Funil /sono/experiencia passa a desbloquear via Pix único (vitalício)
--              ANTES da conta. O guest_id (eco_guest_id) é o fio que liga pagamento →
--              entitlement → /check?guest_id=. Sem ele, o Pix aprova e nada desbloqueia.

ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS guest_id TEXT;

CREATE INDEX IF NOT EXISTS idx_entitlements_guest_id
  ON public.entitlements(guest_id)
  WHERE guest_id IS NOT NULL;

COMMENT ON COLUMN public.entitlements.guest_id IS
  'eco_guest_id que pagou antes de criar conta; usado pelo /check?guest_id= e pelo claim.';
