-- RPC to retrieve semantic memories with composite scoring
-- Combines similarity, recency, tag overlap, emotion alignment, and pin boosts.
-- Applies Max Marginal Relevance (MMR) and token budget limits before returning.

create or replace function public.buscar_memorias_semanticas(
    p_usuario_id uuid,
    p_query vector,
    p_query_emocional vector default null,
    p_tags text[] default '{}',
    p_emocao text default null,
    p_include_referencias boolean default true,
    p_limit integer default 12,
    p_token_budget integer default 1800,
    p_lambda_mmr numeric default 0.6,
    p_recency_halflife_hours numeric default 48,
    p_pin_boost numeric default 0.15
)
returns table (
    origem text,
    memoria_id uuid,
    mensagem_id uuid,
    texto text,
    resumo_eco text,
    tags text[],
    dominio_vida text,
    emocao_principal text,
    intensidade smallint,
    pin boolean,
    salvar_memoria boolean,
    created_at timestamptz,
    updated_at timestamptz,
    composite_score numeric,
    similarity_score numeric,
    emotional_similarity numeric,
    recency_score numeric,
    tag_overlap_score numeric,
    emotion_match_score numeric,
    effective_score numeric
) security definer
set search_path = public
as $$
declare
    v_auth_user uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
    v_token_budget integer := greatest(p_token_budget, 0);
    v_selected_count integer := 0;
    v_candidate record;
    v_max_similarity numeric;
    v_effective numeric;
    v_now timestamptz := now();
    v_lambda numeric := least(greatest(p_lambda_mmr, 0.0), 1.0);
    v_recency_halflife interval := make_interval(hours => p_recency_halflife_hours);
begin
    if not v_is_service and v_auth_user is distinct from p_usuario_id then
        raise exception 'jwt user mismatch (expected %, got %)', p_usuario_id, v_auth_user
            using errcode = '42501';
    end if;

    if p_limit <= 0 then
        return;
    end if;

    -- Clean any leftovers from previous invocations in the same session
    drop table if exists pg_temp.candidate_pool;
    drop table if exists pg_temp.selected_pool;
    drop table if exists pg_temp.result_pool;

    create temporary table candidate_pool on commit drop as
    with base as (
        select
            'memories'::text as origem,
            m.id,
            m.mensagem_id,
            m.texto,
            m.resumo_eco,
            m.tags,
            m.dominio_vida,
            m.emocao_principal,
            m.intensidade,
            m.pin,
            m.salvar_memoria,
            m.created_at,
            m.updated_at,
            m.embedding,
            m.embedding_emocional,
            m.token_count
        from public.memories m
        where m.usuario_id = p_usuario_id
      union all
        select
            'referencias_temporarias'::text as origem,
            r.id,
            r.mensagem_id,
            r.texto,
            r.resumo_eco,
            r.tags,
            r.dominio_vida,
            r.emocao_principal,
            r.intensidade,
            r.pin,
            r.salvar_memoria,
            r.created_at,
            r.updated_at,
            r.embedding,
            r.embedding_emocional,
            r.token_count
        from public.referencias_temporarias r
        where p_include_referencias
          and r.usuario_id = p_usuario_id
    ), scored as (
        select
            b.*,
            (1 - (b.embedding <=> p_query))::numeric as similarity_score,
            case
                when p_query_emocional is null or b.embedding_emocional is null then null
                else (1 - (b.embedding_emocional <=> p_query_emocional))::numeric
            end as emotional_similarity,
            case
                when extract(epoch from v_recency_halflife) <= 0 then 1
                else exp(-greatest(extract(epoch from (v_now - b.created_at)), 0) /
                        nullif(extract(epoch from v_recency_halflife), 0))::numeric
            end as recency_score,
            case
                when p_tags is null or cardinality(p_tags) = 0 then 0
                else coalesce(
                        (
                            select count(distinct tag_value)::numeric
                            from unnest(coalesce(b.tags, '{}')) as tag(tag_value)
                            where tag.tag_value = any(p_tags)
                        ) / nullif(cardinality(p_tags), 0),
                        0
                    )
            end as tag_overlap_score,
            case
                when p_emocao is null then 0
                when lower(coalesce(b.emocao_principal, '')) = lower(p_emocao) then 1
                else 0
            end::numeric as emotion_match_score
        from base b
        where b.embedding is not null
    )
    select
        s.*,
        (coalesce(s.similarity_score, 0) * 0.55
         + coalesce(s.emotional_similarity, 0) * 0.15
         + coalesce(s.recency_score, 0) * 0.15
         + coalesce(s.tag_overlap_score, 0) * 0.1
         + coalesce(s.emotion_match_score, 0) * 0.05
         + case when s.pin then p_pin_boost else 0 end) as composite_score
    from scored s
    order by composite_score desc
    limit 60;

    create temporary table selected_pool (
        id uuid primary key
    ) on commit drop;

    create temporary table result_pool (
        origem text,
        memoria_id uuid,
        mensagem_id uuid,
        texto text,
        resumo_eco text,
        tags text[],
        dominio_vida text,
        emocao_principal text,
        intensidade smallint,
        pin boolean,
        salvar_memoria boolean,
        created_at timestamptz,
        updated_at timestamptz,
        composite_score numeric,
        similarity_score numeric,
        emotional_similarity numeric,
        recency_score numeric,
        tag_overlap_score numeric,
        emotion_match_score numeric,
        effective_score numeric
    ) on commit drop;

    for v_candidate in
        select * from candidate_pool order by composite_score desc
    loop
        exit when v_selected_count >= p_limit or v_token_budget <= 0;

        if v_candidate.token_count is null then
            continue;
        end if;

        if v_candidate.token_count > v_token_budget then
            continue;
        end if;

        if exists (select 1 from selected_pool) then
            select coalesce(max(1 - (v_candidate.embedding <=> c.embedding)), 0)
            into v_max_similarity
            from candidate_pool c
            join selected_pool sp on sp.id = c.id;
        else
            v_max_similarity := 0;
        end if;

        v_effective := v_lambda * v_candidate.composite_score
            - (1 - v_lambda) * coalesce(v_max_similarity, 0);

        if v_effective <= 0 then
            continue;
        end if;

        insert into selected_pool(id) values (v_candidate.id)
            on conflict do nothing;

        insert into result_pool(
            origem, memoria_id, mensagem_id, texto, resumo_eco, tags, dominio_vida,
            emocao_principal, intensidade, pin, salvar_memoria, created_at, updated_at,
            composite_score, similarity_score, emotional_similarity, recency_score,
            tag_overlap_score, emotion_match_score, effective_score
        )
        values (
            v_candidate.origem,
            v_candidate.id,
            v_candidate.mensagem_id,
            v_candidate.texto,
            v_candidate.resumo_eco,
            v_candidate.tags,
            v_candidate.dominio_vida,
            v_candidate.emocao_principal,
            v_candidate.intensidade,
            v_candidate.pin,
            v_candidate.salvar_memoria,
            v_candidate.created_at,
            v_candidate.updated_at,
            v_candidate.composite_score,
            v_candidate.similarity_score,
            v_candidate.emotional_similarity,
            v_candidate.recency_score,
            v_candidate.tag_overlap_score,
            v_candidate.emotion_match_score,
            v_effective
        );

        v_selected_count := v_selected_count + 1;
        v_token_budget := v_token_budget - v_candidate.token_count;
    end loop;

    return query
        select * from result_pool order by effective_score desc;
end;
$$ language plpgsql;

comment on function public.buscar_memorias_semanticas is
$$Retrieve user memories and temporary references ranked by semantic similarity, recency,
tag overlap, emotion matching, and pin boosts while respecting token budgets and
encouraging diversity with Max Marginal Relevance.$$;
