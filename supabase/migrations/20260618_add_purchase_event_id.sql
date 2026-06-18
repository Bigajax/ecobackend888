-- Migration: Add purchase_event_id to Meta CAPI Attribution
-- Date: 2026-06-18
-- Description: Guarda o event_id do Purchase capturado no checkout
--              (create-with-card) para o webhook do Mercado Pago reusar ao
--              disparar o Purchase via Conversions API no início do trial. É o
--              MESMO event_id que o client usa no Pixel, garantindo a
--              deduplicação browser+servidor. Complementa o start_trial_event_id
--              já existente (migration 20260616).

ALTER TABLE public.meta_capi_attribution
  ADD COLUMN IF NOT EXISTS purchase_event_id TEXT;

COMMENT ON COLUMN public.meta_capi_attribution.purchase_event_id IS 'event_id compartilhado com o Pixel do client para dedup do Purchase (disparado no início do trial)';
