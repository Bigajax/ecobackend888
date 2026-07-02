-- Sonhos de GUESTS passam a ser gravados (presente da Noite 1 no funil do sono
-- e funil /sonhos): ate aqui o dreamService so inseria com usuario autenticado
-- (if !isGuest) e a interpretacao do guest era descartada no servidor.
--
-- Design: guests entram com usuario_id NULL + guest_id preenchido (o mesmo
-- guest_id do funil, header X-Eco-Guest-Id) — nao poluem um eventual FK de
-- usuario_id e ficam vinculaveis a conta depois (mesmo padrao do
-- 20260622_add_guest_id_to_entitlements).
--
-- Rodar no SQL Editor do Supabase ANTES do deploy surtir efeito; o codigo e
-- tolerante (insert falho e logado e nao quebra o streaming).

alter table public.dreams
  add column if not exists guest_id text;

alter table public.dreams
  alter column usuario_id drop not null;

create index if not exists idx_dreams_guest_id
  on public.dreams (guest_id)
  where guest_id is not null;
