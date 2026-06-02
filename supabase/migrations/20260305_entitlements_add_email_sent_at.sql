-- Migration: Add welcome_email_sent_at to entitlements
-- Date: 2026-03-05
-- Description: Garante que o e-mail de boas-vindas do Protocolo Sono é enviado
--              exatamente uma vez, mesmo que o webhook MP dispare múltiplas vezes
--              (ex: payment.created → payment.updated, ou Pix pending → approved).

ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.entitlements.welcome_email_sent_at IS
  'Preenchido quando o e-mail de boas-vindas for enviado. NULL = ainda não enviado. Guard contra duplicatas.';
