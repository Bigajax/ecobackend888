-- Use this script to inspect the execution plan of the semantic retrieval RPC.
-- Run: psql -f supabase/observability/explain_buscar_memorias_semanticas.sql

set search_path to public;

\echo 'Analyzing buscar_memorias_semanticas execution plan'
explain (analyze, buffers, timing)
select * from public.buscar_memorias_semanticas(
    p_usuario_id => '00000000-0000-0000-0000-000000000001',
    p_query => (array_fill(0::float4, array[1536]))::vector(1536),
    p_query_emocional => null,
    p_tags => array[]::text[],
    p_emocao => null,
    p_include_referencias => true,
    p_limit => 5,
    p_token_budget => 200
);
