-- Schema definitions for ECO semantic memory storage in Supabase
-- This script is idempotent and can be applied safely multiple times.
-- It assumes the `vector` extension is available in the `extensions` schema
-- (default configuration for Supabase projects).

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

-- Temporary references (<7) stored separately
create table if not exists public.referencias_temporarias (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null references auth.users(id) on delete cascade,
    mensagem_id uuid null,
    referencia_anterior_id uuid null references public.referencias_temporarias(id) on delete set null,
    texto text not null,
    resumo_eco text,
    tags text[] not null default '{}',
    dominio_vida text,
    emocao_principal text,
    intensidade smallint not null check (intensidade between 0 and 10),
    nivel_abertura smallint,
    padrao_comportamental text,
    categoria text,
    analise_resumo text,
    pin boolean not null default false,
    salvar_memoria boolean not null default false,
    embedding vector(1536),
    embedding_emocional vector(256),
    token_count integer generated always as (ceil(coalesce(length(texto), 0) / 4.0)) stored,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- User memories (intensity >= 7) persist long term
create table if not exists public.memories (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null references auth.users(id) on delete cascade,
    mensagem_id uuid null,
    referencia_anterior_id uuid null,
    texto text not null,
    resumo_eco text,
    tags text[] not null default '{}',
    dominio_vida text,
    emocao_principal text,
    intensidade smallint not null check (intensidade between 0 and 10),
    nivel_abertura smallint,
    padrao_comportamental text,
    categoria text,
    analise_resumo text,
    pin boolean not null default false,
    salvar_memoria boolean not null default true,
    embedding vector(1536),
    embedding_emocional vector(256),
    token_count integer generated always as (ceil(coalesce(length(texto), 0) / 4.0)) stored,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Ensure updated_at auto refresh
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_memories_updated_at
    before update on public.memories
    for each row
    execute function public.touch_updated_at();

create trigger set_referencias_updated_at
    before update on public.referencias_temporarias
    for each row
    execute function public.touch_updated_at();

-- Vector and helper indexes
create index if not exists memories_usuario_created_idx
    on public.memories (usuario_id, created_at desc);

create index if not exists referencias_usuario_created_idx
    on public.referencias_temporarias (usuario_id, created_at desc);

create index if not exists memories_tags_gin_idx
    on public.memories using gin (tags);

create index if not exists referencias_tags_gin_idx
    on public.referencias_temporarias using gin (tags);

create index if not exists memories_hnsw_embedding_idx
    on public.memories
    using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 64);

create index if not exists memories_hnsw_emocional_idx
    on public.memories
    using hnsw (embedding_emocional vector_cosine_ops)
    with (m = 16, ef_construction = 64);

create index if not exists referencias_hnsw_embedding_idx
    on public.referencias_temporarias
    using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 64);

create index if not exists referencias_hnsw_emocional_idx
    on public.referencias_temporarias
    using hnsw (embedding_emocional vector_cosine_ops)
    with (m = 16, ef_construction = 64);

-- RLS policies
alter table public.memories enable row level security;
alter table public.referencias_temporarias enable row level security;

-- Owners can manage their own rows
create policy if not exists memories_owner_select on public.memories
    for select using (auth.uid() = usuario_id);

create policy if not exists memories_owner_insert on public.memories
    for insert with check (auth.uid() = usuario_id);

create policy if not exists memories_owner_update on public.memories
    for update using (auth.uid() = usuario_id)
              with check (auth.uid() = usuario_id);

create policy if not exists referencias_owner_select on public.referencias_temporarias
    for select using (auth.uid() = usuario_id);

create policy if not exists referencias_owner_insert on public.referencias_temporarias
    for insert with check (auth.uid() = usuario_id);

create policy if not exists referencias_owner_update on public.referencias_temporarias
    for update using (auth.uid() = usuario_id)
              with check (auth.uid() = usuario_id);

-- Service role bypass via Supabase's JWT claim (checks for service-role key)
create policy if not exists memories_service_role on public.memories
    for all using (auth.role() = 'service_role')
             with check (auth.role() = 'service_role');

create policy if not exists referencias_service_role on public.referencias_temporarias
    for all using (auth.role() = 'service_role')
             with check (auth.role() = 'service_role');

commit;
