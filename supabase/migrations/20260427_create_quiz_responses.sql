-- Migration: Create Quiz Responses Table
-- Date: 2026-04-27
-- Description: Armazena respostas do quiz de sono para análise de perfil e conversão

CREATE TABLE public.quiz_responses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answers      JSONB       NOT NULL,   -- [{ question, answer }, ...]
  utm_data     JSONB,                  -- { utm_source, utm_medium, ... }
  quiz_source  TEXT        NOT NULL DEFAULT 'quiz_sono',
  converted    BOOLEAN     NOT NULL DEFAULT FALSE,
  converted_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_quiz_responses_created_at  ON public.quiz_responses(created_at DESC);
CREATE INDEX idx_quiz_responses_converted   ON public.quiz_responses(converted);
CREATE INDEX idx_quiz_responses_quiz_source ON public.quiz_responses(quiz_source);

-- RLS — apenas service_role lê/escreve (frontend escreve via backend)
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_responses_service_role_all" ON public.quiz_responses
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE  public.quiz_responses                IS 'Respostas do quiz de sono para análise de perfil e conversão';
COMMENT ON COLUMN public.quiz_responses.answers        IS 'Array de objetos { question, answer } — uma entrada por pergunta';
COMMENT ON COLUMN public.quiz_responses.utm_data       IS 'Parâmetros UTM capturados na URL do quiz';
COMMENT ON COLUMN public.quiz_responses.converted      IS 'TRUE quando o usuário clicou no CTA de compra após ver o resultado';
COMMENT ON COLUMN public.quiz_responses.converted_at   IS 'Timestamp do clique no CTA';
