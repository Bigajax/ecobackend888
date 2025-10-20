-- Thin wrapper exposing buscar_memorias_semanticas under the _v2 name for clients.
create or replace function public.buscar_memorias_semanticas_v2(
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
language sql
stable
as $$
  select *
    from public.buscar_memorias_semanticas(
      p_usuario_id => p_usuario_id,
      p_query => p_query,
      p_query_emocional => p_query_emocional,
      p_tags => p_tags,
      p_emocao => p_emocao,
      p_include_referencias => p_include_referencias,
      p_limit => p_limit,
      p_token_budget => p_token_budget,
      p_lambda_mmr => p_lambda_mmr,
      p_recency_halflife_hours => p_recency_halflife_hours,
      p_pin_boost => p_pin_boost
    );
$$;
