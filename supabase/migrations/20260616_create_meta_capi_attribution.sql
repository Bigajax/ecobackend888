-- Migration: Create Meta CAPI Attribution Table
-- Date: 2026-06-16
-- Description: Guarda os dados de atribuição do Meta capturados no checkout
--              (create-with-card) para o webhook do Mercado Pago reusar ao
--              disparar StartTrial/Subscribe via Conversions API. O
--              start_trial_event_id é o MESMO event_id que o client usa no
--              Pixel, garantindo a deduplicação browser+servidor.

CREATE TABLE public.meta_capi_attribution (
  preapproval_id        TEXT        PRIMARY KEY,                 -- id da preapproval MP (correlação no webhook)
  user_id               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  start_trial_event_id  TEXT        NOT NULL,                    -- event_id compartilhado com o Pixel do client
  fbp                   TEXT,                                    -- cookie _fbp
  fbc                   TEXT,                                    -- cookie _fbc (ou derivado de fbclid)
  event_source_url      TEXT,
  client_ip             TEXT,
  client_user_agent     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para lookup por usuário (fallback caso o preapproval_id não bata)
CREATE INDEX idx_meta_capi_attribution_user_id
  ON public.meta_capi_attribution(user_id)
  WHERE user_id IS NOT NULL;

-- RLS
ALTER TABLE public.meta_capi_attribution ENABLE ROW LEVEL SECURITY;

-- Apenas o service role (backend) acessa — não há leitura pelo client.
CREATE POLICY "meta_capi_attribution_service_role_all" ON public.meta_capi_attribution
  FOR ALL USING (auth.role() = 'service_role');

-- Comentários
COMMENT ON TABLE public.meta_capi_attribution IS 'Atribuição Meta (event_id/fbp/fbc/ip/ua) capturada no checkout para o webhook do MP disparar CAPI deduplicado';
COMMENT ON COLUMN public.meta_capi_attribution.preapproval_id IS 'ID da preapproval do Mercado Pago — chave de correlação no webhook';
COMMENT ON COLUMN public.meta_capi_attribution.start_trial_event_id IS 'event_id compartilhado com o Pixel do client para dedup do StartTrial';
