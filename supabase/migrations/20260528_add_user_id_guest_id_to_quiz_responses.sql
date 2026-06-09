-- Migration: Add user_id, guest_id, skipped to quiz_responses
-- Date: 2026-05-28
-- Description: Suporte para vincular respostas ao usuário pós-signup e rastrear guests

ALTER TABLE public.quiz_responses
  ADD COLUMN user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN guest_id TEXT,
  ADD COLUMN skipped  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_quiz_responses_user_id  ON public.quiz_responses(user_id);
CREATE INDEX idx_quiz_responses_guest_id ON public.quiz_responses(guest_id);

COMMENT ON COLUMN public.quiz_responses.user_id  IS 'Set when user signs up after answering (linked via PATCH /link-user)';
COMMENT ON COLUMN public.quiz_responses.guest_id IS 'x-eco-guest-id at submit time, for pre-auth tracking';
COMMENT ON COLUMN public.quiz_responses.skipped  IS 'TRUE when user clicked Pular (answers is [])';
