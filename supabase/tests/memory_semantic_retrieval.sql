-- pgTAP tests for buscar_memorias_semanticas RPC
-- Run with: pg_prove supabase/tests/memory_semantic_retrieval.sql

begin;

set search_path to public;
create schema if not exists auth;
create table if not exists auth.users (
    id uuid primary key,
    email text
);

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Seed user and rows
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'eco-test@example.com')
on conflict do nothing;

insert into public.memories (
    id, usuario_id, texto, tags, intensidade, pin, salvar_memoria,
    embedding, embedding_emocional
) values (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'Primeira memória intensa',
    array['familia', 'rotina'],
    9,
    true,
    true,
    (array_fill(0.1::float4, array[1536]))::vector(1536),
    (array_fill(0.1::float4, array[256]))::vector(256)
) on conflict do nothing;

insert into public.referencias_temporarias (
    id, usuario_id, texto, tags, intensidade, salvar_memoria,
    embedding, embedding_emocional
) values (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000001',
    'Referência mais leve',
    array['familia'],
    5,
    false,
    (array_fill(0.2::float4, array[1536]))::vector(1536),
    (array_fill(0.2::float4, array[256]))::vector(256)
) on conflict do nothing;

-- Execute RPC with service role context
select isa_ok(
    $$select * from public.buscar_memorias_semanticas(
        p_usuario_id => '00000000-0000-0000-0000-000000000001',
        p_query => (array_fill(0.1::float4, array[1536]))::vector(1536),
        p_query_emocional => (array_fill(0.1::float4, array[256]))::vector(256),
        p_tags => array['familia'],
        p_emocao => null,
        p_include_referencias => true,
        p_limit => 5,
        p_token_budget => 200
    );$$,
    'buscar_memorias_semanticas returns rows'
);

select cmp_ok(
    (select count(*) from public.buscar_memorias_semanticas(
        '00000000-0000-0000-0000-000000000001',
        (array_fill(0.1::float4, array[1536]))::vector(1536),
        (array_fill(0.1::float4, array[256]))::vector(256),
        array['familia'],
        null,
        true,
        5,
        200
    )),
    '>=',
    1,
    'At least one record returned'
);

select cmp_ok(
    (select max(effective_score) from public.buscar_memorias_semanticas(
        '00000000-0000-0000-0000-000000000001',
        (array_fill(0.1::float4, array[1536]))::vector(1536),
        (array_fill(0.1::float4, array[256]))::vector(256),
        array['familia'],
        null,
        true,
        5,
        200
    )),
    '>',
    0,
    'Effective score is positive'
);

select cmp_ok(
    (select min(token_count) from (
        select token_count from public.memories where usuario_id = '00000000-0000-0000-0000-000000000001'
        union all
        select token_count from public.referencias_temporarias where usuario_id = '00000000-0000-0000-0000-000000000001'
    ) s),
    '>=',
    0,
    'Token counts are non-negative'
);

select finish();

rollback;
