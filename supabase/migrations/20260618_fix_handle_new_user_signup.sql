-- Migration: Blindar o cadastro (handle_new_user) do Protocolo do Sono
-- Date: 2026-06-18
-- Motivo: o cadastro do funil sono falhava ~2 em 3 (38 "Cadastro falhou" + 14
-- "sem resposta" vs 7 "concluído" em 24h). O signup é 100% client-side
-- (supabase.auth.signUp). Causa server-side mais provável: um trigger
-- `handle_new_user` em auth.users desalinhado com o schema ATUAL de
-- public.usuarios — que hoje só tem (id, plan_type, subscription_status,
-- trial_*, access_until, current_period_end, provider_*, created_at,
-- updated_at). NÃO tem mais nome/email/telefone/tipo_plano/ativo. Se a função
-- antiga insere essas colunas, ela aborta a transação do INSERT em auth.users
-- e o signUp devolve 500 "Database error saving new user" para TODO mundo.
--
-- Esta migration redefine `handle_new_user` de forma à prova de falha: insere
-- só o id (o resto do schema tem default/null) e NUNCA aborta o signup.
--
-- ⚠️ Rode o BLOCO DE INSPEÇÃO (abaixo) primeiro no SQL Editor do Supabase e
-- compare com o diagnóstico antes de aplicar o resto.

-- ============================================================================
-- BLOCO DE INSPEÇÃO (rode isolado primeiro; é só SELECT, não altera nada)
-- ============================================================================
-- 1) Definição atual da função (se existir):
--    SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure);
--
-- 2) Triggers em auth.users:
--    SELECT tgname, tgenabled, pg_get_triggerdef(oid)
--    FROM pg_trigger
--    WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;
--
-- 3) Colunas atuais de public.usuarios (confirmar que NÃO tem nome/email/etc):
--    SELECT column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'usuarios'
--    ORDER BY ordinal_position;
--
-- 4) Policies/RLS de usuarios (confirmar que não há INSERT por authenticated —
--    por isso a criação da linha tem que ser via trigger SECURITY DEFINER):
--    SELECT polname, cmd, roles FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'usuarios';
-- ============================================================================


-- ============================================================================
-- FIX: função handle_new_user à prova de falha
-- - SECURITY DEFINER: roda com permissão do owner, não depende de policy de
--   INSERT por `authenticated` (o RLS de usuarios só tem SELECT own + service_role).
-- - SET search_path = public: evita sequestro de search_path (boa prática Supabase).
-- - Insere SÓ o id; ON CONFLICT DO NOTHING (idempotente, reentrante).
-- - EXCEPTION WHEN OTHERS THEN RETURN NEW: se QUALQUER coisa der errado na
--   criação do perfil, o signup do usuário NÃO é abortado (nunca mais 500).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Perfil é "best effort": webhook do Mercado Pago (service_role) também
    -- cria/atualiza a linha. Logamos o aviso mas deixamos o signup concluir.
    RAISE WARNING 'handle_new_user falhou para %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Cria a linha de assinatura (public.usuarios) ao registrar um auth.users. À prova de falha: insere só o id e nunca aborta o signup.';

-- (Re)cria o trigger AFTER INSERT em auth.users apontando pra função acima.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- CHECKLIST PÓS-APLICAÇÃO
-- ============================================================================
-- [ ] Rodou o bloco de inspeção e confirmou que a função antiga inseria colunas
--     que não existem mais (nome/email/tipo_plano/ativo)? Esta substitui.
-- [ ] Se havia OUTRO trigger com nome diferente (ex.: handle_new_user2,
--     create_user_profile), confirme no item 2 da inspeção e desabilite/dropie
--     o antigo — senão ele continua abortando o signup.
-- [ ] Teste um signup REAL pelo app (e-mail novo) → deve virar "Cadastro
--     concluído" e aparecer uma linha em public.usuarios com só o id preenchido.
-- [ ] Confira na nova telemetria do front ("Cadastro falhou") que status_http
--     deixou de vir 500. Acompanhe a taxa concluído/enviado subir > 80%.
-- ============================================================================
